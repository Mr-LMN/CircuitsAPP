export const DEFAULT_CHIPPER_REP_SCHEME = [50, 50, 40, 40, 30, 30, 20, 20, 10];

/**
 * @typedef {{ name?: string; reps?: number | string; category?: string }} RawChipperStep
 * @typedef {{ name: string; reps: number; category: string }} NormalisedChipperStep
 * @typedef {{ name: string; category: string; order: number }} ChipperItem
 * @typedef {{ reps: number | 'Other'; items: ChipperItem[] }} ChipperBucket
 */

export function createDefaultChipperStep(index = 0, category = 'Bodyweight') {
        const schemeIndex = Math.min(index, DEFAULT_CHIPPER_REP_SCHEME.length - 1);
        const fallback = DEFAULT_CHIPPER_REP_SCHEME[schemeIndex] ?? DEFAULT_CHIPPER_REP_SCHEME[DEFAULT_CHIPPER_REP_SCHEME.length - 1] ?? 10;
        return {
                name: '',
                reps: fallback,
                category
        };
}

/**
 * @param {RawChipperStep[]} steps
 * @param {(value?: string) => string} sanitizeCategory
 * @returns {NormalisedChipperStep[]}
 */
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

/**
 * @param {RawChipperStep[]} steps
 * @returns {ChipperBucket[]}
 */
export function buildChipperGroups(steps = []) {
        if (!Array.isArray(steps)) return [];

        /** @type {ChipperBucket[]} */
        const buckets = [];
        /** @type {Record<string, ChipperBucket>} */
        const lookup = Object.create(null);

        steps.forEach((step, index) => {
                const repsValue = Number(step?.reps);
                const numericReps = Number.isFinite(repsValue) && repsValue > 0 ? Math.round(repsValue) : null;
                const keyLabel = numericReps !== null ? `reps-${numericReps}` : 'other';

                if (!lookup[keyLabel]) {
                        lookup[keyLabel] = {
                                reps: numericReps ?? 'Other',
                                items: []
                        };
                        buckets.push(lookup[keyLabel]);
                }

                lookup[keyLabel].items.push({
                        name: step?.name ?? '',
                        category: step?.category ?? '',
                        order: index + 1
                });
        });

        return buckets
                .sort((a, b) => {
                        const isNumA = typeof a.reps === 'number';
                        const isNumB = typeof b.reps === 'number';
                        if (isNumA && isNumB) return Number(b.reps) - Number(a.reps);
                        if (isNumA) return -1;
                        if (isNumB) return 1;
                        return String(a.reps).localeCompare(String(b.reps));
                })
                .map((bucket) => ({
                        reps: bucket.reps,
                        items: bucket.items.map((item) => ({
                                ...item,
                                name: item.name || 'Movement'
                        }))
                }));
}

/**
 * @param {RawChipperStep} step
 */
export function hasIncompleteChipperStep(step) {
        const name = step?.name?.trim?.();
        const repsValue = Number(step?.reps);
        return !name || !Number.isFinite(repsValue) || repsValue <= 0;
}
