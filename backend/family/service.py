"""Family plans (handoff 10 §3–§5): the dashboard, members, roles and removal.

Every figure is the money engine's. A member's total is the same sum Home
shows them (`analytics.counted`), converted to the family's currency; the
family total is the unrounded sum of those, rounded once. Member rows shown
beside it use `round_to_total`, so they always add up to it (04 §3.4).

Who sees what (10 §2, option A, and 10 §1's permissions):
- everyone in the family sees the member list, roles and subscription counts;
- the family total, and other members' totals, only with `can_view_family_total`
  (admins always), since anyone with the other totals could add them up;
- another member's subscriptions only as an admin, and their private ones
  only as "Private subscription": amount yes, name, mark, category and date no.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from bson import ObjectId
from django.db import IntegrityError
from django_mongodb_backend import transaction
from rest_framework import status

from accounts.models import settings_for
from core.contract import ApiError, money, not_found, rounded
from subscriptions import analytics, operations, presenters
from subscriptions.models import Subscription
from subscriptions.services import money as engine

from .models import Family, Membership
from .permissions import membership_of

Role = Membership.Role
ROLE_ORDER = {Role.ADMIN: 0, Role.MEMBER: 1, Role.VIEWER: 2}


# Errors -----------------------------------------------------------------------------


def no_family() -> ApiError:
    return ApiError(status.HTTP_404_NOT_FOUND, "no_family", "You're not in a family yet.")


def admin_only() -> ApiError:
    return ApiError(
        status.HTTP_403_FORBIDDEN, "family_admin_only", "Only a family admin can do that."
    )


def already_in_family() -> ApiError:
    return ApiError(
        status.HTTP_409_CONFLICT, "already_in_family", "You're already in a family. Leave it first."
    )


def last_admin() -> ApiError:
    return ApiError(
        status.HTTP_409_CONFLICT,
        "last_admin",
        "A family needs an admin. Make someone else an admin first.",
    )


def only_member() -> ApiError:
    """Leaving a family you're alone in: there's nobody to make an admin."""
    return ApiError(
        status.HTTP_409_CONFLICT,
        "only_member",
        "You're the only one in this family. Delete the family instead.",
    )


# Lookups ----------------------------------------------------------------------------


def _mine(user) -> Membership:
    membership = membership_of(user)
    if membership is None:
        raise no_family()
    return membership


def _admin(user) -> Membership:
    membership = _mine(user)
    if not membership.is_admin:
        raise admin_only()
    return membership


def _member(family: Family, membership_id: str) -> Membership:
    """A membership in `family`, or 404, so ids from other families can't be probed."""
    if not ObjectId.is_valid(membership_id):
        raise not_found()
    found = (
        Membership.objects.filter(family=family, pk=ObjectId(membership_id))
        .select_related("user", "family")
        .first()
    )
    if found is None:
        raise not_found()
    return found


def _memberships(family: Family) -> list[Membership]:
    rows = Membership.objects.filter(family=family).select_related("user")
    return sorted(rows, key=lambda m: (ROLE_ORDER[m.role], m.joined_at, str(m.pk)))


def _admin_count(family: Family) -> int:
    # Not .count(): that's a $unionWith, which MongoDB refuses inside a transaction.
    return len(Membership.objects.filter(family=family, role=Role.ADMIN).values_list("pk"))


# Figures ----------------------------------------------------------------------------


def context(family: Family, *, today: date) -> presenters.Context:
    """Figures in the family's currency, whoever is looking (10 §5)."""
    return presenters.Context(
        today=today,
        currency=family.display_currency,
        rates=operations.fx_rates(),
        marks=presenters.service_marks(),
    )


@dataclass
class MemberFigures:
    membership: Membership
    subscriptions: list[Subscription]
    # Unrounded, in the family's currency, of the subscriptions that have a rate.
    total: Decimal
    unconverted: int


def _figures(membership: Membership, ctx: presenters.Context) -> MemberFigures:
    subs = analytics.counted(membership.user, ctx.today)
    convertible = [s for s in subs if ctx.can_convert(s.billing_currency)]
    items = operations.line_items(convertible, today=ctx.today)
    return MemberFigures(
        membership=membership,
        subscriptions=subs,
        total=engine.monthly_total(items, ctx.currency, ctx.rates),
        unconverted=len(subs) - len(convertible),
    )


def _limit(membership: Membership, total: Decimal, currency: str) -> tuple[dict | None, bool]:
    if membership.spending_limit is None:
        return None, False
    return (
        money(membership.spending_limit, currency),
        engine.round_money(total, currency) > membership.spending_limit,
    )


def _permissions(membership: Membership) -> dict:
    return {
        "can_add_subscriptions": membership.can_add_subscriptions,
        "can_edit_own_subs": membership.can_edit_own_subs,
        "can_view_family_total": membership.can_view_family_total,
    }


def _person(membership: Membership, viewer: Membership) -> dict:
    return {
        "id": str(membership.pk),
        "user_id": str(membership.user_id),
        "name": membership.user.name,
        "email": membership.user.email,
        "role": membership.role,
        "is_you": membership.pk == viewer.pk,
    }


# Dashboard (10 §3.1) ----------------------------------------------------------------


def dashboard(user, *, today: date) -> dict:
    viewer = _mine(user)
    family = viewer.family
    ctx = context(family, today=today)
    figures = [_figures(m, ctx) for m in _memberships(family)]
    sees_all = viewer.may_see_total

    family_total = sum((f.total for f in figures), Decimal(0))
    # Lines beside the total add up to it exactly.
    lines = engine.round_to_total([f.total for f in figures], ctx.currency)

    members = []
    for f, line in zip(figures, lines, strict=True):
        visible = sees_all or f.membership.pk == viewer.pk
        limit, over = _limit(f.membership, f.total, ctx.currency)
        members.append(
            {
                **_person(f.membership, viewer),
                "subscription_count": len(f.subscriptions),
                "total": rounded(line, ctx.currency) if visible else None,
                "spending_limit": limit,
                "over_limit": over if visible else None,
            }
        )
    # Imported here: invitations builds on this module.
    from . import invitations

    seats_taken = invitations.seats_taken(family, invitations.timezone.now())
    return {
        **_family_fields(family),
        "seats_used": len(figures),
        "seats_taken": seats_taken,
        "can_invite": viewer.is_admin and seats_taken < family.seat_limit,
        "invitations": invitations.for_admin(family) if viewer.is_admin else [],
        "you": {
            "membership_id": str(viewer.pk),
            "role": viewer.role,
            "may_add_subscriptions": viewer.may_add,
            "may_edit_subscriptions": viewer.may_edit,
            "may_view_family_total": sees_all,
        },
        "total": money(family_total, ctx.currency) if sees_all else None,
        # None, like `total`: without the permission nothing is claimed either way.
        "unconverted_count": sum(f.unconverted for f in figures) if sees_all else None,
        "members": members,
    }


def _family_fields(family: Family) -> dict:
    return {
        "id": str(family.pk),
        "name": family.name,
        "plan": family.plan,
        "seat_limit": family.seat_limit,
        "display_currency": family.display_currency,
        "shared_timezone": family.shared_timezone,
        "fiscal_year_start": family.fiscal_year_start,
    }


def create_family(user, *, name: str, display_currency: str | None, today: date) -> dict:
    """The caller starts a family and is its first admin."""
    if membership_of(user) is not None:
        raise already_in_family()
    currency = display_currency or settings_for(user).display_currency
    try:
        with transaction.atomic():
            family = Family.objects.create(name=name, owner=user, display_currency=currency)
            Membership.objects.create(family=family, user=user, role=Role.ADMIN)
    except IntegrityError:
        # A parallel request made them a member first.
        raise already_in_family() from None
    return dashboard(user, today=today)


def update_family(user, changes: dict, *, today: date) -> dict:
    family = _admin(user).family
    for field, value in changes.items():
        setattr(family, field, value)
    family.save(update_fields=list(changes))
    return dashboard(user, today=today)


@transaction.atomic
def delete_family(user) -> None:
    """Members go back to being on their own. No subscription is touched (10 §4)."""
    family = _admin(user).family
    Membership.objects.filter(family=family).delete()
    family.delete()


# Members (10 §3.4, §3.6) ------------------------------------------------------------


def _subscription_row(sub: Subscription, line: Decimal | None, ctx, *, hidden: bool) -> dict:
    if hidden:
        # 10 §2 option A: counted, never named.
        return {
            "id": None,
            "name": None,
            "is_private": True,
            "service_mark": None,
            "category": None,
            "next_bill_date": None,
            "billing_price": None,
            "monthly": rounded(line, ctx.currency) if line is not None else None,
        }
    return {
        "id": str(sub.pk),
        "name": sub.name,
        "is_private": sub.is_private,
        "service_mark": ctx.marks.get(sub.name),
        "category": presenters.category_ref(sub.category),
        "next_bill_date": sub.next_bill_date,
        "billing_price": money(sub.billing_price, sub.billing_currency),
        "monthly": rounded(line, ctx.currency) if line is not None else None,
    }


def member_detail(user, membership_id: str, *, today: date) -> dict:
    viewer = _mine(user)
    target = _member(viewer.family, membership_id)
    is_self = target.pk == viewer.pk
    if not (viewer.is_admin or is_self):
        # Only admins look at other people's subscriptions; 404 like any id that isn't yours.
        raise not_found()
    ctx = context(viewer.family, today=today)
    figures = _figures(target, ctx)

    monthly = [
        ctx.convert(engine.normalize_to_monthly(s.billing_price, s.cycle), s.billing_currency)
        for s in figures.subscriptions
    ]
    known = [m for m in monthly if m is not None]
    # One rounded line per known amount, in order: each row with an amount takes
    # the next one (comprehensions run left to right), and rows without one take
    # none. The stable sort below then keeps named rows in the query's order.
    lines = iter(engine.round_to_total(known, ctx.currency))
    rows = [
        _subscription_row(
            sub, next(lines) if m is not None else None, ctx, hidden=sub.is_private and not is_self
        )
        for sub, m in zip(figures.subscriptions, monthly, strict=True)
    ]
    # Named ones first, soonest bill first (the query's order); private ones last.
    rows.sort(key=lambda row: row["name"] is None)

    limit, over = _limit(target, figures.total, ctx.currency)
    return {
        **_person(target, viewer),
        **_permissions(target),
        "joined_at": target.joined_at,
        "spending_limit": limit,
        "over_limit": over,
        "total": money(figures.total, ctx.currency),
        "unconverted_count": figures.unconverted,
        "subscriptions": rows,
    }


def update_member(user, membership_id: str, changes: dict, *, today: date) -> dict:
    """Role, permissions and spending limit. Admins only; a family keeps an admin."""
    viewer = _admin(user)
    with transaction.atomic():
        target = _member(viewer.family, membership_id)
        demoting = target.is_admin and changes.get("role", Role.ADMIN) != Role.ADMIN
        if demoting and _admin_count(viewer.family) == 1:
            raise last_admin()
        for field, value in changes.items():
            setattr(target, field, value)
        target.save(update_fields=list(changes))
    return member_detail(user, membership_id, today=today)


def remove_member(user, membership_id: str) -> None:
    """An admin removes anyone; anyone can leave. Their subscriptions stay theirs
    and simply leave the family total (10 §3.6); nothing is deleted."""
    viewer = _mine(user)
    with transaction.atomic():
        target = _member(viewer.family, membership_id)
        if target.pk != viewer.pk and not viewer.is_admin:
            raise admin_only()
        family = viewer.family
        if target.is_admin and _admin_count(family) == 1:
            # Alone in the family, promoting someone isn't possible: the way
            # out is DELETE /family.
            if len(Membership.objects.filter(family=family).values_list("pk")) == 1:
                raise only_member()
            raise last_admin()
        target.delete()
        if family.owner_id == target.user_id:
            # The creator left: the longest-standing admin takes over.
            heir = (
                Membership.objects.filter(family=family, role=Role.ADMIN)
                .order_by("joined_at")
                .first()
            )
            # The guards above keep an admin behind; this keeps that local.
            if heir is None:
                raise last_admin()
            family.owner_id = heir.user_id
            family.save(update_fields=["owner"])
