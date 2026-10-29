"""The hourly trial-conversion task (spec section 8, 04 §6a)."""

from datetime import timedelta

import pytest
from django.core.management import call_command

from subscriptions.models import Subscription
from subscriptions.seed import SEED_TODAY
from subscriptions.tasks import convert_expired_trials


@pytest.fixture
def ending_trial(alex):
    """Alex's trial, set to have ended yesterday."""
    trial = Subscription.objects.filter(owner=alex, is_trial=True).first()
    assert trial, "the seed dataset is meant to include a trial"
    trial.trial_ends_on = SEED_TODAY - timedelta(days=1)
    trial.save(update_fields=["trial_ends_on"])
    return trial


@pytest.mark.django_db
def test_an_ended_trial_becomes_a_paying_subscription(ending_trial):
    converted = convert_expired_trials(SEED_TODAY.isoformat())

    ending_trial.refresh_from_db()
    assert converted == 1
    assert ending_trial.is_trial is False


@pytest.mark.django_db
def test_a_trial_that_has_not_ended_is_left_alone(ending_trial):
    ending_trial.trial_ends_on = SEED_TODAY + timedelta(days=5)
    ending_trial.save(update_fields=["trial_ends_on"])

    assert convert_expired_trials(SEED_TODAY.isoformat()) == 0
    ending_trial.refresh_from_db()
    assert ending_trial.is_trial is True


@pytest.mark.django_db
def test_running_it_twice_converts_nothing_the_second_time(ending_trial):
    assert convert_expired_trials(SEED_TODAY.isoformat()) == 1
    assert convert_expired_trials(SEED_TODAY.isoformat()) == 0


@pytest.mark.django_db
def test_the_command_and_the_task_run_the_same_code(ending_trial, capsys):
    # The command exists so a human can force a conversion; if it drifted
    # from the hourly task, the demo and production would disagree.
    call_command("convert_trials", f"--today={SEED_TODAY.isoformat()}")

    ending_trial.refresh_from_db()
    assert "Converted 1 trial(s)." in capsys.readouterr().out
    assert ending_trial.is_trial is False
