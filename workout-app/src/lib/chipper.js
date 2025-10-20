export const DEFAULT_CHIPPER_REP_SCHEME = [50, 50, 40, 40, 30, 30, 20, 20, 10];

export function createDefaultChipperStep(index = 0, category = 'Bodyweight') {
        const schemeIndex = Math.min(index, DEFAULT_CHIPPER_REP_SCHEME.length - 1);
        const fallback = DEFAULT_CHIPPER_REP_SCHEME[schemeIndex] ?? DEFAULT_CHIPPER_REP_SCHEME[DEFAULT_CHIPPER_REP_SCHEME.length - 1] ?? 10;
        return {
                name: '',
                reps: fallback,
                category
        };
}

export function normaliseChipperSteps(steps = [], sanitizeCategory = (value) => value ?? '') {
        return steps.map((step, index) => {
                const repsValue = Number(step?.reps);
                const schemeIndex = Math.min(index, DEFAULT_CHIPPER_REP_SCHEME.length - 1);
                const fallback = DEFAULT_CHIPPER_REP_SCHEME[schemeIndex] ?? 10;
                const safeReps = Number.isFinite(repsValue) && repsValue > 0 ? Math.round(repsValue) : Math.round(fallback);
                return {
                        name: step?.name?.trim?.() ?? '',
                        reps: safeReps,
                        category: sanitizeCategory(step?.category)
                };
        });
}

export function hasIncompleteChipperStep(step) {
        const name = step?.name?.trim?.();
        const repsValue = Number(step?.reps);
        return !name || !Number.isFinite(repsValue) || repsValue <= 0;
}
