import type { Timestamp } from 'firebase/firestore';

export type WorkoutMode = 'Circuit' | 'Partner' | 'Chipper' | string;
export type PhaseType = 'idle' | 'work' | 'rest' | 'move' | 'swap' | 'complete' | string;

export interface Exercise {
	id?: string;
	name: string;
	category?: string;
	equipment?: string | string[];
	p1?: { task?: string };
	p2?: { task?: string };
}

export interface SessionTiming {
	work: number;
	swap: number;
	move: number;
	rounds: number;
}

export interface Workout {
	id: string;
	title: string;
	type?: string;
	mode: WorkoutMode;
	exercises: Exercise[];
	organisationId?: string;
	creatorId?: string;
	notes?: string;
}

export type UserRole = 'coach' | 'staff' | 'student';
export type SessionType = 'staff-class' | 'student-led' | 'quick';

export interface LiveState {
	phase: string;
	phaseIndex: number;
	phaseType: PhaseType;
	phaseStartedAt?: Timestamp | Date | number;
	phaseDuration?: number;
	pausedAt?: Timestamp | Date | number | null;
	remainingWhenPaused?: number | null;
	remaining: number;
	duration: number;
	isRunning: boolean;
	isComplete: boolean;
	currentStation: number;
	currentRound: number;
	updatedAt?: Timestamp;
}

export interface RSVP {
	userId: string;
	displayName?: string;
	email?: string;
	bookedAt?: Timestamp;
}

export interface Session {
	id: string;
	workoutId: string;
	date: Timestamp | Date;
	startsAt?: Timestamp | Date;
	sessionDate?: Timestamp | Date;
	durationMinutes?: number;
	sessionType?: SessionType;
	creatorRole?: UserRole;
	creatorId?: string;
	organisationId?: string;
	capacity?: number;
	rsvps?: RSVP[];
	timing?: SessionTiming;
}

export interface Profile {
	id?: string;
	displayName?: string;
	email?: string;
	isAdmin?: boolean;
	role?: UserRole;
	organisationId?: string;
}

export type StationAssignment = string[];
