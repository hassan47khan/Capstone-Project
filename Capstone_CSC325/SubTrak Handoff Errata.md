# SubTrak handoff errata (use these over any older handoff copy)

1. Home comes from Figma frame 4:2901 in the ORIGINAL file kyUS7F8bg4x7GpcPEF4UDN.
   Never build 113:641 ("2 - Dashboard") or 113:765 ("1b - Connect Email (failed)").
   All other screens use the newer file IKYivyJtmBYzJNQ7g8qPGc.
2. Delete is a soft delete (status=deleted, history kept) with a 6-second Undo toast
   that calls POST /subscriptions/{id}/restore. It is not a hard delete.
3. Active trials never count toward monthly or annual totals until they convert.
   Alex's monthly total stays $129.20 (EUR 118.56 at 0.9177).
4. color.danger is only for errors and destructive actions. Never use it on urgency
   chips or data. Use the warning tokens instead.
5. Stack: expo-router, React Native StyleSheet with tokens, TanStack Query,
   TypeScript strict, simplejwt.
6. Open questions: Adobe CC price ($59.99 in the Analytics frame vs $54.99 in the
   dataset), paywall, Family in/out, email provider, target platforms.
