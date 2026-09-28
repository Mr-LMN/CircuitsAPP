/**
 * Pick the most relevant already-sorted upcoming session.
 * @param {{ id: string, creatorId?: string, organisationId?: string, rsvps?: { userId?: string }[] }[]} sessions
 * @param {{ userId: string, isAdmin?: boolean, organisationId?: string | null, bookedSessionIds?: Iterable<string> }} context
 */
export function selectRelevantSession(sessions, context) {
	const bookedIds = new Set(context.bookedSessionIds ?? []);
	const booked = sessions.find(
		(session) =>
			bookedIds.has(session.id) || session.rsvps?.some((rsvp) => rsvp.userId === context.userId)
	);
	if (booked) return booked;
	if (context.isAdmin) {
		const coached = sessions.find((session) => session.creatorId === context.userId);
		if (coached) return coached;
	}
	if (context.organisationId) {
		const organisationSession = sessions.find(
			(session) => session.organisationId === context.organisationId
		);
		if (organisationSession) return organisationSession;
	}
	return sessions.find((session) => !session.organisationId) ?? null;
}
