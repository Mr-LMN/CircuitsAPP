import { writable } from 'svelte/store';

/** @typedef {{id:number, message:string, type:string}} Toast */
export const toasts = writable(/** @type {Toast[]} */ ([]));
let nextId = 1;

/** @param {string} message @param {'success'|'info'|'warning'|'error'|string} type @param {number} duration */
export function notify(message, type = 'info', duration = 4200) {
	const id = nextId++;
	toasts.update((items) => [...items, { id, message, type }]);
	if (duration > 0 && typeof window !== 'undefined')
		window.setTimeout(() => dismissToast(id), duration);
	return id;
}

/** @param {number} id */
export function dismissToast(id) {
	toasts.update((items) => items.filter((item) => item.id !== id));
}
