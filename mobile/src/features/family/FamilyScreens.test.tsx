/**
 * Family screens (handoff 10) against the mock server's Kim family:
 * Alex (admin) 129.20 + Jordan (member, $100 limit) 45.98 + Sam (viewer)
 * 22.98 = 198.16, all worked out by the server (familyMock.ts).
 */
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { fireEvent, screen, waitFor, within } from '@testing-library/react-native';

import { SessionProvider } from '@/session/SessionContext';
import { tokenStore } from '@/session/tokenStore';
import { MOCK_EMAILS } from '@/test/fixtures';
import { flattenStyle, renderWithProviders } from '@/test/render';
import { lightColors } from '@/theme';

import { ACCEPT_COPY, FamilyInviteScreen, problemCopy } from './FamilyInviteScreen';
import { FamilyMemberScreen, nextLabel } from './FamilyMemberScreen';
import { FamilyScreen, initials, memberCaption, memberLabel } from './FamilyScreen';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Stack = createNativeStackNavigator<any>();

async function renderFamily(
  email: string = MOCK_EMAILS.full,
  initial = 'Family',
  params?: object,
) {
  await tokenStore.setRefreshToken(`mock-refresh-${email}`);
  return renderWithProviders(
    <SessionProvider>
      <NavigationContainer>
        <Stack.Navigator
          screenOptions={{ headerShown: false }}
          initialRouteName={initial}
        >
          <Stack.Screen name="Family" component={FamilyScreen} />
          <Stack.Screen name="FamilyMember" component={FamilyMemberScreen} />
          <Stack.Screen
            name="FamilyInvite"
            component={FamilyInviteScreen}
            initialParams={params}
          />
          <Stack.Screen name="MainTabs" component={FamilyScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </SessionProvider>,
  );
}

/** Text the element contains, not all of it. */
const part = (text: string) => new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

const toast = () => screen.getByTestId('toast', { includeHiddenElements: true });

beforeEach(async () => {
  await tokenStore.clear();
});

describe('helpers', () => {
  const jordan = {
    id: 'mem-jordan',
    user_id: 'u',
    name: 'Jordan Doe',
    email: 'j@x.test',
    role: 'member' as const,
    is_you: false,
    subscription_count: 4,
    total: { amount: '45.98', currency: 'USD' },
    spending_limit: null,
    over_limit: false,
  };

  it('a member row reads like 10 §7 asks', () => {
    expect(memberLabel(jordan)).toBe(
      'Jordan Doe, member, 4 subscriptions, $45.98 per month.',
    );
    expect(memberCaption(jordan)).toBe('$45.98/mo · 4 subscriptions');
  });

  it('a hidden total leaves only the count', () => {
    expect(memberCaption({ ...jordan, total: null })).toBe('4 subscriptions');
    expect(memberLabel({ ...jordan, total: null })).toBe(
      'Jordan Doe, member, 4 subscriptions.',
    );
  });

  it('formats the next bill as "Next: Oct 03"', () => {
    expect(nextLabel('2026-10-03')).toBe('Next: Oct 03');
    expect(nextLabel(null)).toBeNull();
  });

  it('initials', () => {
    expect(initials('Jordan Doe')).toBe('JD');
    expect(initials('Sam')).toBe('S');
  });

  it('every accept-screen problem has its own words', () => {
    const base = {
      family_name: 'Kim family',
      invited_by: 'Alex Kim',
      email: 'sam@subtrak.test',
      role: 'member' as const,
      status: 'pending' as const,
      expires_at: '',
    };
    const problems = [
      'expired',
      'accepted',
      'revoked',
      'wrong_account',
      'already_member',
      'in_another_family',
    ] as const;
    const titles = problems.map((problem) => problemCopy({ ...base, problem }).title);
    expect(new Set(titles).size).toBe(problems.length);
    expect(problemCopy({ ...base, problem: 'wrong_account' }).title).toBe(
      'This invitation is for sam@subtrak.test',
    );
  });

  it('names the role with the right article, and never says "null"', () => {
    expect(ACCEPT_COPY.invitedBy('Alex Kim', 'admin')).toBe(
      'Alex Kim invited you as an admin.',
    );
    expect(ACCEPT_COPY.invitedBy('Alex Kim', 'viewer')).toBe(
      'Alex Kim invited you as a viewer.',
    );
    expect(ACCEPT_COPY.invitedBy(null, 'member')).toBe("You're invited as a member.");
    const nameless = {
      family_name: 'Kim family',
      invited_by: null as unknown as string,
      email: 'sam@subtrak.test',
      role: 'member' as const,
      status: 'expired' as const,
      expires_at: '',
    };
    for (const problem of ['expired', 'accepted', 'revoked'] as const) {
      const { message } = problemCopy({ ...nameless, problem });
      expect(message).not.toMatch(/null|undefined/);
      expect(message).toMatch(/the person who invited you/);
    }
  });
});

describe('Family', () => {
  it('shows the server total and each member, with the seat count in the title', async () => {
    await renderFamily();

    expect(await screen.findByTestId('family-total')).toHaveTextContent(
      part('$198.16/mo'),
    );
    expect(screen.getByText('Family Members (3 of 5)')).toBeOnTheScreen();
    expect(screen.getByTestId('family-member-mem-jordan')).toHaveTextContent(
      part('Jordan DoeMember$45.98/mo · 4 subscriptions'),
    );
    expect(screen.getByTestId('family-member-mem-sam')).toHaveTextContent(
      part('SamViewer$22.98/mo · 2 subscriptions'),
    );
    expect(screen.getByTestId('family-member-mem-alex')).toHaveTextContent(
      part('Alex Kim (you)'),
    );
  });

  it('the admin badge is accent; member and viewer stay neutral (10 §3.3)', async () => {
    await renderFamily();

    const fill = (id: string) =>
      flattenStyle(screen.getByTestId(`family-role-${id}`).props.style).backgroundColor;
    expect(await screen.findByTestId('family-role-mem-alex')).toHaveTextContent('Admin');
    expect(fill('mem-alex')).toBe(lightColors.accentSurface);
    expect(fill('mem-jordan')).toBe(lightColors.surface2);
    expect(fill('mem-sam')).toBe(lightColors.surface2);
  });

  it('someone in no family can start one', async () => {
    await renderFamily(MOCK_EMAILS.empty);

    expect(await screen.findByTestId('family-start')).toBeOnTheScreen();
    expect(screen.getByTestId('family-start-save')).toBeDisabled();
    await fireEvent.changeText(screen.getByTestId('family-start-name'), 'Riveras');
    await fireEvent.press(screen.getByTestId('family-start-save'));

    expect(await screen.findByText('Family Members (1 of 5)')).toBeOnTheScreen();
    expect(screen.getByTestId('family-invite')).toBeOnTheScreen();
  });

  it('inviting adds an Invited row with Resend and Revoke', async () => {
    await renderFamily();
    await fireEvent.press(await screen.findByTestId('family-invite'));
    await fireEvent.changeText(
      await screen.findByTestId('invite-email'),
      'riley@example.com',
    );
    await fireEvent.press(screen.getByTestId('invite-send'));

    const row = await screen.findByTestId('family-invitation-inv-1');
    expect(row).toHaveTextContent(part('riley@example.com'));
    expect(within(row).getByText('Invited')).toBeOnTheScreen();
    await waitFor(() =>
      expect(toast()).toHaveTextContent(part('Invitation sent to riley@example.com.')),
    );

    await fireEvent.press(screen.getByTestId('family-revoke-inv-1'));
    await waitFor(() =>
      expect(screen.queryByTestId('family-invitation-inv-1')).toBeNull(),
    );
  });

  it('inviting someone already in the family marks the email field', async () => {
    await renderFamily();
    await fireEvent.press(await screen.findByTestId('family-invite'));
    await fireEvent.changeText(
      await screen.findByTestId('invite-email'),
      'jordan.doe@example.com',
    );
    await fireEvent.press(screen.getByTestId('invite-send'));

    expect(await screen.findByText("They're already in this family.")).toBeOnTheScreen();
    expect(screen.getByTestId('invite-sheet')).toBeOnTheScreen();
  });

  it('when every seat is taken, Invite stays but is disabled with the upgrade prompt', async () => {
    await renderFamily();
    for (const email of ['one@example.com', 'two@example.com']) {
      await fireEvent.press(await screen.findByTestId('family-invite'));
      await fireEvent.changeText(await screen.findByTestId('invite-email'), email);
      await fireEvent.press(screen.getByTestId('invite-send'));
      await waitFor(() => expect(screen.queryByTestId('invite-email')).toBeNull());
    }

    expect(await screen.findByTestId('family-seats-full')).toHaveTextContent(
      part('Every seat is taken. Upgrade the plan to invite more people.'),
    );
    expect(screen.getByTestId('family-invite')).toBeDisabled();
  });
});

describe('Member detail', () => {
  async function openJordan() {
    await renderFamily();
    await fireEvent.press(await screen.findByTestId('family-member-mem-jordan'));
    return screen.findByTestId('member-profile');
  }

  it("lists Jordan's subscriptions and his total; a private one has no name", async () => {
    await openJordan();

    expect(screen.getByTestId('member-sub-sub-hulu')).toHaveTextContent(
      part('HuluNext: Oct 05$17.99'),
    );
    const hidden = screen.getByTestId('member-sub-private-3');
    expect(hidden).toHaveTextContent(part('Private subscription$4.00'));
    expect(hidden.props.accessibilityLabel).toBe(
      'Private subscription, details hidden, $4.00 per month',
    );
    expect(screen.getByTestId('member-total')).toHaveTextContent(part('$45.98/mo'));
    expect(screen.getByTestId('member-limit')).toHaveTextContent(part('$100.00'));
  });

  it('an admin changes a permission and the role', async () => {
    await openJordan();

    expect(screen.getByTestId('member-can-add')).toBeChecked();
    await fireEvent.press(screen.getByTestId('member-can-add'));
    await waitFor(() => expect(screen.getByTestId('member-can-add')).not.toBeChecked());

    await fireEvent.press(screen.getByText('Viewer'));
    await waitFor(() =>
      expect(screen.getByTestId('member-role-consequence')).toHaveTextContent(
        part('Read-only. Can be kept from seeing the family total.'),
      ),
    );
  });

  it('removing explains that subscriptions stay theirs, then goes back without them', async () => {
    await openJordan();
    await fireEvent.press(screen.getByTestId('member-remove'));

    expect(
      await screen.findByText(
        "Jordan's subscriptions leave the family total and stay in their own account. Nothing is deleted.",
      ),
    ).toBeOnTheScreen();
    await fireEvent.press(screen.getByText('Remove'));

    await waitFor(() =>
      expect(screen.queryByTestId('family-member-mem-jordan')).toBeNull(),
    );
    expect(await screen.findByTestId('family-total')).toHaveTextContent(
      part('$152.18/mo'),
    );
  });

  it("the only admin can't step down: the server says why", async () => {
    await renderFamily();
    await fireEvent.press(await screen.findByTestId('family-member-mem-alex'));
    await screen.findByTestId('member-profile');

    await fireEvent.press(screen.getByText('Member'));

    await waitFor(() =>
      expect(toast()).toHaveTextContent(
        part('A family needs an admin. Make someone else an admin first.'),
      ),
    );
    expect(screen.getByTestId('member-role-consequence')).toHaveTextContent(
      part('Can manage members, permissions and the family settings.'),
    );
  });
});

describe('Accept an invitation', () => {
  it('shows who invited you and what the admin will see, then joins', async () => {
    await renderFamily(MOCK_EMAILS.empty, 'FamilyInvite', { token: 'invite-kim' });

    expect(await screen.findByText('Join Kim family')).toBeOnTheScreen();
    expect(screen.getByText('Alex Kim invited you as a member.')).toBeOnTheScreen();
    expect(screen.getByText(/You can mark any subscription private/)).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('invite-accept'));

    expect(await screen.findByText('Family Members (4 of 5)')).toBeOnTheScreen();
  });

  it.each([
    [
      'invite-expired',
      MOCK_EMAILS.empty,
      'invite-problem-expired',
      'This invitation has expired',
    ],
    [
      'invite-used',
      MOCK_EMAILS.empty,
      'invite-problem-accepted',
      'This invitation has already been used',
    ],
    [
      'invite-kim',
      MOCK_EMAILS.missingRate,
      'invite-problem-wrong_account',
      'This invitation is for sam@subtrak.test',
    ],
    [
      'invite-kim',
      MOCK_EMAILS.full,
      'invite-problem-already_member',
      "You're already in Kim family",
    ],
  ])('%s as %s shows its error state', async (token, email, testID, title) => {
    await renderFamily(email, 'FamilyInvite', { token });
    expect(await screen.findByTestId(testID)).toHaveTextContent(new RegExp(title));
    expect(screen.queryByTestId('invite-accept')).toBeNull();
  });

  it('a made-up or missing token says the link is not valid', async () => {
    await renderFamily(MOCK_EMAILS.empty, 'FamilyInvite', { token: 'nope' });
    expect(await screen.findByTestId('invite-invalid')).toBeOnTheScreen();
  });
});
