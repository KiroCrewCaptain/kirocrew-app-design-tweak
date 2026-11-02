import { activeLocale, fmtRelative, useAppApi, useImeGuard, useLanguageGeneration, useNavigate } from "@kirocrew/app-sdk";
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ChevronDown, ChevronRight, Eye, Folder, FolderOpen, History, MessageSquare, Monitor, MoreHorizontal, Pencil, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { Clickable, ErrorNotice } from "@kirocrew/app-sdk/ui";
import { jsx, jsxs } from "react/jsx-runtime";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
// src/appApi.ts
var bound = null;
/** Called by the page root with `useAppApi()`. */
function bindAppApi(api) {
	bound = api;
}
function currentAppApi() {
	if (!bound) throw new Error("design-tweak: the host API is not bound yet");
	return bound;
}
/** A refused request: the HTTP status, the raw body, and a readable message. */
var ApiError = class extends Error {
	status;
	body;
	constructor(status, message, body = "") {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.body = body;
	}
};
/** The server's own sentence for a refusal (`{"error": "..."}`), else `HTTP <status>`. */
function friendlyErrText(status, body) {
	try {
		const parsed = JSON.parse(body);
		if (parsed && typeof parsed === "object") {
			const err = parsed.error ?? parsed.message;
			if (typeof err === "string" && err.trim()) return err.trim();
		}
	} catch {}
	const text = body.trim();
	if (text && text.length <= 200 && !text.startsWith("<")) return text;
	return `HTTP ${status}`;
}
/** The scoped client's non-2xx (it carries `status` and `body`) as an `ApiError`;
*  anything else (a network failure, an abort) is returned unchanged. */
function toApiError(e) {
	const status = e?.status;
	if (typeof status !== "number") return e;
	const body = String(e.body ?? "");
	return new ApiError(status, friendlyErrText(status, body), body);
}
function FolderBody({ open, padding = "2px", instantClose = false, children }) {
	const [layoutSuppressed, setLayoutSuppressed] = useState(!open);
	useEffect(() => {
		if (open) {
			setLayoutSuppressed(false);
			return;
		}
		const timer = setTimeout(() => setLayoutSuppressed(true), 150);
		return () => clearTimeout(timer);
	}, [open]);
	return /* @__PURE__ */ jsx("div", {
		"aria-hidden": !open,
		inert: !open ? "" : void 0,
		style: {
			display: "grid",
			gridTemplateRows: open ? "1fr" : "0fr",
			transition: !open && instantClose ? "none" : `grid-template-rows 150ms ease-out`
		},
		children: /* @__PURE__ */ jsx("div", {
			style: {
				overflow: "clip",
				minHeight: 0,
				minWidth: 0,
				visibility: open ? "visible" : "hidden",
				opacity: open ? 1 : 0,
				contentVisibility: layoutSuppressed ? "hidden" : "visible",
				padding: open ? padding : 0
			},
			children
		})
	});
}
// src/DropdownMenu.tsx
/**
* A small dropdown menu with the call-site shape of the dashboard's
* `components/ui/dropdown-menu` (a Radix wrapper that is not part of the App
* SDK): `DropdownMenu`, `DropdownMenuTrigger asChild`, `DropdownMenuContent
* align`, `DropdownMenuItem onSelect`. The class strings are the dashboard's.
*
* The content renders into `document.body` at a fixed point under the trigger,
* so no scrolling or clipped ancestor can hide it. It closes on Escape (focus
* returns to the trigger), on a press outside it, on a scroll, on a resize, and
* after an item runs. The first item takes focus when it opens, and the arrow
* keys move between items.
*/
var MenuContext = createContext(null);
function useMenu() {
	const ctx = useContext(MenuContext);
	if (!ctx) throw new Error("DropdownMenu parts must sit inside <DropdownMenu>");
	return ctx;
}
function DropdownMenu({ children }) {
	const [open, setOpen] = useState(false);
	const triggerRef = useRef(null);
	const value = useMemo(() => ({
		open,
		setOpen,
		triggerRef
	}), [open]);
	return /* @__PURE__ */ jsx(MenuContext.Provider, {
		value,
		children
	});
}
function DropdownMenuTrigger({ children }) {
	const { open, setOpen, triggerRef } = useMenu();
	if (!isValidElement(children)) return children;
	const { onPointerDown, onKeyDown } = children.props;
	return cloneElement(children, {
		ref: (el) => {
			triggerRef.current = el;
		},
		"aria-haspopup": "menu",
		"aria-expanded": open,
		onPointerDown: (e) => {
			onPointerDown?.(e);
			if (e.button !== 0 || e.ctrlKey) return;
			e.preventDefault();
			setOpen(!open);
		},
		onKeyDown: (e) => {
			onKeyDown?.(e);
			if (e.key !== "Enter" && e.key !== " " && e.key !== "ArrowDown") return;
			e.preventDefault();
			setOpen(true);
		}
	});
}
function DropdownMenuContent({ align = "start", className = "", onClick, children }) {
	const { open, setOpen, triggerRef } = useMenu();
	const ref = useRef(null);
	const [at, setAt] = useState(null);
	useEffect(() => {
		if (!open) {
			setAt(null);
			return;
		}
		const rect = triggerRef.current?.getBoundingClientRect();
		const top = (rect?.bottom ?? 0) + 4;
		setAt(align === "end" ? {
			top,
			right: Math.max(0, window.innerWidth - (rect?.right ?? 0))
		} : {
			top,
			left: rect?.left ?? 0
		});
	}, [
		open,
		align,
		triggerRef
	]);
	useEffect(() => {
		if (!open || !at) return;
		const items = () => Array.from(ref.current?.querySelectorAll("[role=\"menuitem\"]") ?? []);
		items()[0]?.focus({ preventScroll: true });
		const onDown = (e) => {
			const target = e.target;
			if (ref.current?.contains(target) || triggerRef.current?.contains(target)) return;
			setOpen(false);
		};
		const onKey = (e) => {
			if (e.key === "Escape") {
				e.preventDefault();
				setOpen(false);
				triggerRef.current?.focus();
				return;
			}
			if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
			e.preventDefault();
			const list = items();
			if (list.length === 0) return;
			const i = list.indexOf(document.activeElement);
			list[e.key === "ArrowDown" ? (i + 1) % list.length : (i - 1 + list.length) % list.length].focus();
		};
		const close = () => setOpen(false);
		document.addEventListener("mousedown", onDown, true);
		document.addEventListener("keydown", onKey, true);
		window.addEventListener("resize", close);
		window.addEventListener("scroll", close, true);
		return () => {
			document.removeEventListener("mousedown", onDown, true);
			document.removeEventListener("keydown", onKey, true);
			window.removeEventListener("resize", close);
			window.removeEventListener("scroll", close, true);
		};
	}, [
		open,
		at,
		setOpen,
		triggerRef
	]);
	if (!open || !at) return null;
	return createPortal(/* @__PURE__ */ jsx("div", {
		ref,
		role: "menu",
		"data-state": "open",
		onClick,
		style: {
			position: "fixed",
			...at
		},
		className: "z-[9999] min-w-[8rem] overflow-y-auto overscroll-contain rounded-lg border border-border bg-bg-elevated p-1 text-text shadow-lg " + className,
		children
	}), document.body);
}
function DropdownMenuItem({ onSelect, className = "", children }) {
	const { setOpen } = useMenu();
	const run = useCallback(() => {
		setOpen(false);
		onSelect?.();
	}, [setOpen, onSelect]);
	return /* @__PURE__ */ jsx("div", {
		role: "menuitem",
		tabIndex: -1,
		onClick: run,
		onKeyDown: (e) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				run();
			}
		},
		className: "relative flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-1.5 text-[13px] outline-hidden transition-colors focus:bg-bg-hover " + className,
		children
	});
}
// src/i18n.ts
/**
* The app's own strings. A bundle cannot read the dashboard's catalogs (those
* belong to the host and change with it), so every locale the dashboard ships is
* bundled here and looked up against the host's active language.
*
* Lookup order: the exact locale (`pt`, `zh-CN`), then its base language, then
* English, then the key itself, so a missing translation shows English rather
* than nothing. `{{name}}` placeholders are filled from `vars`; one with no value
* is left as written.
*
* `t` reads the language at call time. The root component subscribes to the
* host's language changes (`useLanguageGeneration`), and its re-render reaches
* every child, so a language switch repaints the page without a reload.
*/
var CATALOGS = {
	bn: {
		comments: {
			"an_earlier_comment": "আগের একটি কমেন্ট",
			"element_count": "{{n}}টি এলিমেন্ট",
			"follow_up_to": "↩ {{label}}-এর ফলো-আপ",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "প্রিভিউতে এই কমেন্টটি খুলতে ক্লিক করুন",
			"remove_from_draft": "ড্রাফট থেকে এই কমেন্টটি সরান"
		},
		devServer: {
			"detect_hint": "এই প্রজেক্টটি তার চলমান ডেভ সার্ভার থেকে প্রিভিউ করুন (হট রিলোড কাজ করতে থাকে)",
			"dev_server": "ডেভ সার্ভার",
			"looking": "খোঁজা হচ্ছে…",
			"preview_from_disk_instead": "পরিবর্তে ডিস্ক থেকে প্রিভিউ করুন",
			"url_placeholder": "http://localhost:5173",
			"use": "ব্যবহার করুন"
		},
		layout: { "drag_to_resize": "আকার বদলাতে টেনে আনুন" },
		modes: {
			"edit": "সম্পাদনা",
			"preview": "প্রিভিউ"
		},
		page: {
			"tagline": "দেখিয়ে দিন, বর্ণনা করুন, আর কোড নিজেই মিলে যাক।",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "অ্যাপের ব্যাকএন্ড সাড়া দেয়নি। আপনি যদি এটি সদ্য বদলে থাকেন, অ্যাপস পেজে Design Tweak বন্ধ করে আবার চালু করুন।",
			"dev_server_not_reachable": "ডেভ সার্ভারে পৌঁছানো যাচ্ছে না",
			"dim_desktop": "ডেস্কটপ",
			"dim_mobile": "মোবাইল",
			"dim_tablet": "ট্যাবলেট",
			"dimensions": "মাপ",
			"fallback_name": "প্রিভিউ",
			"frame_title": "অ্যাপ প্রিভিউ",
			"loading_name": "{{name}} লোড হচ্ছে…",
			"needs_dev_server_title": "এটি একটি ওয়েব অ্যাপ — এর একটি ডেভ সার্ভার দরকার",
			"no_dev_script_in_package_json": "package.json-এ কোনো dev স্ক্রিপ্ট পাওয়া যায়নি — নিজে এটি চালু করুন, তারপর নিচের ডেভ সার্ভার চাপুন।",
			"no_html_entry": "ডিস্ক থেকে পরিবেশন করার মতো কোনো HTML এন্ট্রি পয়েন্ট নেই, তাই এটিকে তার নিজের ডেভ সার্ভার দিয়েই বিল্ড করে পরিবেশন করতে হবে।",
			"not_reachable": "প্রিভিউতে পৌঁছানো যাচ্ছে না",
			"nothing_answered_at": "{{url}}-এ কিছুই সাড়া দেয়নি। এই প্রজেক্টের ডেভ সার্ভার চালু করে আবার চেষ্টা করুন — অথবা এর URL মুছে দিয়ে ফাইলগুলো ডিস্ক থেকে প্রিভিউ করুন।",
			"refresh_preview": "প্রিভিউ রিফ্রেশ করুন",
			"retry": "আবার চেষ্টা করুন",
			"runs_command_in_project": "{{name}}-এ {{command}} চালায়",
			"start_dev_server": "ডেভ সার্ভার চালু করুন",
			"starting": "চালু হচ্ছে…",
			"timed_out": "সময় শেষ হয়ে গেছে",
			"unbundled_entry": "এর এন্ট্রি পয়েন্ট {{entry}} — TypeScript/JSX, যা ব্রাউজার চালাতে পারে না। পরিবেশন করার সময়েই ফাইলগুলো বিল্ড করতে হয়, তাই ডিস্ক থেকে প্রিভিউ করার কিছু নেই।"
		},
		projects: {
			"add": "যোগ করুন",
			"browse_or_type_path": "একটি ফোল্ডার ব্রাউজ করুন, বা তার পাথ লিখুন",
			"click_again_to_disconnect": "সংযোগ বিচ্ছিন্ন করতে আবার ক্লিক করুন",
			"connect": "সংযোগ করুন",
			"connected": "সংযুক্ত",
			"dev_badge": "dev",
			"load_new_app": "নতুন অ্যাপ লোড করুন",
			"loading": "লোড হচ্ছে…",
			"loading_your_apps": "আপনার অ্যাপগুলো লোড হচ্ছে…",
			"looking_for_connected_apps": "আপনার সংযুক্ত অ্যাপগুলো খোঁজা হচ্ছে…",
			"needs_dev_server": "একটি ডেভ সার্ভার দরকার ({{command}})",
			"no_app_selected": "কোনো ওয়েব অ্যাপ নির্বাচন করা হয়নি। ড্রপডাউন থেকে একটি বেছে নিন — বদলানো সঙ্গে সঙ্গেই হয়।",
			"no_dev_script": "কোনো dev স্ক্রিপ্ট পাওয়া যায়নি",
			"none_loaded": "এখনও কোনো ওয়েব অ্যাপ লোড করা হয়নি।",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "{{url}} থেকে প্রিভিউ করা হচ্ছে",
			"remove_from_list": "তালিকা থেকে সরান",
			"select_app": "একটি ওয়েব অ্যাপ বেছে নিন…"
		},
		requests: {
			"archive_to_history": "হিস্ট্রিতে আর্কাইভ করুন",
			"chip_done": "{{n}}টি সম্পন্ন",
			"chip_in_progress": "{{n}}টি চলছে",
			"chip_not_sent": "{{n}}টি পাঠানো হয়নি",
			"chip_queued": "{{n}}টি কিউতে",
			"delete_confirm": "রিকোয়েস্ট {{number}} মুছবেন? এর কমেন্টগুলি স্থায়ীভাবে মুছে যাবে — এটি আর ফেরানো যাবে না।",
			"delete_request": "রিকোয়েস্ট মুছুন",
			"empty_for_app": "{{name}}-এর জন্য এখনও কোনো এডিট রিকোয়েস্ট নেই। প্রিভিউকে সম্পাদনা মোডে নিন, একটি এলিমেন্টে রাইট-ক্লিক করুন, আর পরিবর্তনটি বর্ণনা করুন। কমেন্টগুলো একটি রিকোয়েস্টে জমা হয়, যা আপনি একসঙ্গে পাঠান।",
			"empty_no_app": "কোনো ওয়েব অ্যাপ সংযুক্ত নেই। উপরের ড্রপডাউন থেকে একটি বেছে নিন — প্রতিটি অ্যাপ নিজের রিকোয়েস্ট, হিস্ট্রি ও চ্যাট সেশন আলাদাভাবে রাখে।",
			"history": "হিস্ট্রি",
			"more_actions": "রিকোয়েস্ট {{number}} এর জন্য আরও অ্যাকশন",
			"no_comments": "এখনও কোনো কমেন্ট নেই।",
			"open_in_chat": "চ্যাটে খুলুন",
			"request_number": "রিকোয়েস্ট {{number}}",
			"sending": "পাঠানো হচ্ছে…",
			"send_request": "রিকোয়েস্ট {{number}} হিসেবে পাঠান",
			"send_missing_request": "রিকোয়েস্ট {{number}} পাঠান",
			"this_app": "এই অ্যাপ"
		},
		status: {
			"add_failed": "যোগ করা যায়নি: {{error}}",
			"added_comment": "{{label}} যোগ করা হয়েছে — রিকোয়েস্ট {{number}}-এ {{n}}টি, এখনও পাঠানো হয়নি।",
			"added_dev_previewing": "{{name}} যোগ করা হয়েছে (ডেভ সার্ভার) — প্রিভিউ করা হচ্ছে।",
			"added_found_dev_server": "{{name}} যোগ করা হয়েছে — {{url}}-এ এর ডেভ সার্ভার পাওয়া গেছে।",
			"added_many_dev_servers": "{{name}} যোগ করা হয়েছে — এই ফোল্ডারের সঙ্গে {{n}}টি ডেভ সার্ভার মেলে, তাই কোনোটিই ধরে নেওয়া হয়নি। ড্রপডাউন থেকে একটি নির্ধারণ করুন।",
			"added_previewing": "{{name}} যোগ করা হয়েছে — প্রিভিউ করা হচ্ছে।",
			"already_registered": "ইতিমধ্যেই নিবন্ধিত — {{name}}-এ পাল্টানো হয়েছে।",
			"already_sent": "রিকোয়েস্ট {{number}} ইতিমধ্যেই পাঠানো হয়েছে।",
			"archive_failed": "আর্কাইভ করা যায়নি: {{error}}",
			"capture_failed": "ক্যাপচার করা যায়নি: {{error}}",
			"could_not_start_dev_server": "ডেভ সার্ভার চালু করা যায়নি।",
			"delete_failed": "মুছে ফেলা যায়নি: {{error}}",
			"detect_failed": "শনাক্ত করা যায়নি: {{error}}",
			"dev_server_running": "{{url}}-এ ডেভ সার্ভার চলছে।",
			"dev_server_stopped": "ডেভ সার্ভার থেমে গেছে — ডিস্ক থেকে প্রিভিউ করা হচ্ছে।",
			"failed": "ব্যর্থ: {{error}}",
			"follow_up_added": "ফলো-আপ {{label}} রিকোয়েস্ট {{number}}-এ যোগ করা হয়েছে — এখনও পাঠানো হয়নি।",
			"follow_up_failed": "ফলো-আপ করা যায়নি: {{error}}",
			"follow_up_origin_missing": "ফলো-আপ করার জন্য সেই কমেন্টটি খুঁজে পাওয়া যায়নি।",
			"looking_for_dev_server": "একটি ডেভ সার্ভার খোঁজা হচ্ছে…",
			"no_dev_server_found": "এই ফোল্ডারের জন্য কোনো ডেভ সার্ভার পাওয়া যায়নি — এটি চালু করুন, বা URL লিখুন।",
			"opening_folder_picker": "ফোল্ডার পিকার খোলা হচ্ছে…",
			"picker_unavailable": "পিকার পাওয়া যাচ্ছে না ({{error}}) — বরং পাথ লিখুন।",
			"preview_refreshed": "প্রিভিউ রিফ্রেশ হয়েছে — {{label}} সম্পন্ন",
			"previewing_from_disk": "{{name}} ডিস্ক থেকে প্রিভিউ করা হচ্ছে।",
			"previewing_from_url": "{{name}} {{url}} থেকে প্রিভিউ করা হচ্ছে।",
			"remove_failed": "সরানো যায়নি: {{error}}",
			"dispatch_failed_unconfirmed": "রিকোয়েস্ট {{number}} সিল হয়েছে, কিন্তু ডেলিভারি নিশ্চিত করা যায়নি ({{error}})। সেশন যাচাই করা হচ্ছে — তালিকা আপডেট হবে।",
			"sent_request_to_session": "রিকোয়েস্ট {{number}} ({{n}}) → {{label}} সেশনে পাঠানো হয়েছে।",
			"no_session_for_request": "রিকোয়েস্ট {{number}} তৈরি, কিন্তু এই অ্যাপের কোনো ফোল্ডার নেই, তাই পাঠানোর মতো কোনো সেশন নেই। অ্যাপের ফোল্ডার সেট করুন, তারপর তালিকা থেকে পাঠান।",
			"servers_match_folder": "এই ফোল্ডারের সঙ্গে {{n}}টি সার্ভার মেলে ({{ports}}) — একটি বেছে নিন।",
			"set_dev_server_for": "{{name}}-এর জন্য ডেভ সার্ভার নির্ধারণ করা হয়েছে।",
			"starting_command": "{{command}} চালু হচ্ছে…",
			"starting_dev_server": "ডেভ সার্ভার চালু হচ্ছে…",
			"stop_failed": "থামানো যায়নি: {{error}}",
			"unknown": "অজানা",
			"unknown_error": "অজানা ত্রুটি",
			"using_running_dev_server": "{{url}}-এ ইতিমধ্যেই চলমান ডেভ সার্ভারটি ব্যবহার করা হচ্ছে।"
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "আপনার লাইভ অ্যাপ প্রিভিউতে ভিজ্যুয়ালি এলিমেন্ট নির্বাচন করুন এবং সেগুলোকে এজেন্টের জন্য স্কোপ করা, সোর্স-ম্যাপড এডিট রিকোয়েস্টে রূপান্তর করুন — Figma কমেন্টের মতো, কিন্তু কোডের জন্য।",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "পাঠানো যায়নি",
			"send_failed_with_error": "পাঠানো যায়নি: {{error}}",
			"accepted_body_unreadable": "সার্ভার অনুরোধ গ্রহণ করেছে, কিন্তু তার উত্তর পড়া যায়নি।",
			"no_response_returned": "কোনো প্রতিক্রিয়া পাওয়া যায়নি"
		}
	},
	de: {
		comments: {
			"an_earlier_comment": "einem früheren Kommentar",
			"element_count": "{{n}} Elemente",
			"follow_up_to": "↩ Folgekommentar zu {{label}}",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "Klicken, um diesen Kommentar in der Vorschau zu öffnen",
			"remove_from_draft": "Diesen Kommentar aus dem Entwurf entfernen"
		},
		devServer: {
			"detect_hint": "Dieses Projekt über seinen laufenden Dev-Server in der Vorschau anzeigen (Hot Reload bleibt aktiv)",
			"dev_server": "Dev-Server",
			"looking": "Suche läuft…",
			"preview_from_disk_instead": "Stattdessen von der Festplatte in der Vorschau anzeigen",
			"url_placeholder": "http://localhost:5173",
			"use": "Verwenden"
		},
		layout: { "drag_to_resize": "Zum Ändern der Größe ziehen" },
		modes: {
			"edit": "Bearbeiten",
			"preview": "Vorschau"
		},
		page: {
			"tagline": "Zeigen, beschreiben — und zusehen, wie der Code nachzieht.",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "Das App-Backend hat nicht geantwortet. Wenn Sie es gerade geändert haben, schalten Sie Design Tweak auf der Apps-Seite aus und wieder ein.",
			"dev_server_not_reachable": "Dev-Server nicht erreichbar",
			"dim_desktop": "Desktop",
			"dim_mobile": "Mobil",
			"dim_tablet": "Tablet",
			"dimensions": "Abmessungen",
			"fallback_name": "Vorschau",
			"frame_title": "App-Vorschau",
			"loading_name": "{{name}} wird geladen…",
			"needs_dev_server_title": "Dies ist eine Web-App — sie benötigt einen Dev-Server",
			"no_dev_script_in_package_json": "Kein dev-Skript in package.json gefunden — starten Sie ihn selbst und klicken Sie dann unten auf „Dev-Server“.",
			"no_html_entry": "Es gibt keinen HTML-Einstiegspunkt, der von der Festplatte ausgeliefert werden könnte, daher muss die App von ihrem eigenen Dev-Server gebaut und ausgeliefert werden.",
			"not_reachable": "Vorschau nicht erreichbar",
			"nothing_answered_at": "Unter {{url}} hat nichts geantwortet. Starten Sie den Dev-Server für dieses Projekt und versuchen Sie es erneut — oder löschen Sie dessen URL, um stattdessen die Dateien von der Festplatte in der Vorschau anzuzeigen.",
			"refresh_preview": "Vorschau aktualisieren",
			"retry": "Erneut versuchen",
			"runs_command_in_project": "Führt {{command}} in {{name}} aus",
			"start_dev_server": "Dev-Server starten",
			"starting": "Wird gestartet…",
			"timed_out": "Zeitüberschreitung",
			"unbundled_entry": "Ihr Einstiegspunkt ist {{entry}} — TypeScript/JSX, das ein Browser nicht ausführen kann. Die Dateien müssen beim Ausliefern gebaut werden, daher gibt es nichts, was von der Festplatte in der Vorschau angezeigt werden könnte."
		},
		projects: {
			"add": "Hinzufügen",
			"browse_or_type_path": "Nach einem Ordner suchen oder dessen Pfad eingeben",
			"click_again_to_disconnect": "Erneut klicken, um die Verbindung zu trennen",
			"connect": "Verbinden",
			"connected": "Verbunden",
			"dev_badge": "dev",
			"load_new_app": "Neue App laden",
			"loading": "Wird geladen…",
			"loading_your_apps": "Ihre Apps werden geladen…",
			"looking_for_connected_apps": "Suche nach Ihren verbundenen Apps…",
			"needs_dev_server": "Benötigt einen Dev-Server ({{command}})",
			"no_app_selected": "Keine Web-App ausgewählt. Wählen Sie eine im Dropdown aus — der Wechsel erfolgt sofort.",
			"no_dev_script": "kein dev-Skript gefunden",
			"none_loaded": "Noch keine Web-Apps geladen.",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "Vorschau von {{url}}",
			"remove_from_list": "Aus der Liste entfernen",
			"select_app": "Web-App auswählen…"
		},
		requests: {
			"archive_to_history": "Im Verlauf archivieren",
			"chip_done": "{{n}} fertig",
			"chip_in_progress": "{{n}} in Arbeit",
			"chip_not_sent": "{{n}} nicht gesendet",
			"chip_queued": "{{n}} in der Warteschlange",
			"delete_confirm": "Anfrage {{number}} löschen? Ihre Kommentare werden endgültig entfernt – das kann nicht widerrufen werden.",
			"delete_request": "Anfrage löschen",
			"empty_for_app": "Noch keine Änderungsanfragen für {{name}}. Schalten Sie die Vorschau in den Modus „Bearbeiten“, klicken Sie mit der rechten Maustaste auf ein Element und beschreiben Sie die Änderung. Kommentare sammeln sich in einer Anfrage, die Sie als Stapel senden.",
			"empty_no_app": "Keine Web-App verbunden. Wählen Sie oben eine im Dropdown aus — jede App behält ihre eigenen Anfragen, ihren eigenen Verlauf und ihre eigene Chat-Sitzung.",
			"history": "Verlauf",
			"more_actions": "Weitere Aktionen für Anfrage {{number}}",
			"no_comments": "Noch keine Kommentare.",
			"open_in_chat": "Im Chat öffnen",
			"request_number": "Anfrage {{number}}",
			"sending": "Wird gesendet…",
			"send_request": "Als Anfrage {{number}} senden",
			"send_missing_request": "Anfrage {{number}} senden",
			"this_app": "diese App"
		},
		status: {
			"add_failed": "Hinzufügen fehlgeschlagen: {{error}}",
			"added_comment": "{{label}} hinzugefügt — {{n}} in Anfrage {{number}}, noch nicht gesendet.",
			"added_dev_previewing": "{{name}} hinzugefügt (Dev-Server) — Vorschau läuft.",
			"added_found_dev_server": "{{name}} hinzugefügt — Dev-Server unter {{url}} gefunden.",
			"added_many_dev_servers": "{{name}} hinzugefügt — {{n}} Dev-Server passen zu diesem Ordner, daher wurde keiner angenommen. Legen Sie einen im Dropdown fest.",
			"added_previewing": "{{name}} hinzugefügt — Vorschau läuft.",
			"already_registered": "Bereits registriert — zu {{name}} gewechselt.",
			"already_sent": "Anfrage {{number}} wurde bereits gesendet.",
			"archive_failed": "Archivieren fehlgeschlagen: {{error}}",
			"capture_failed": "Erfassen fehlgeschlagen: {{error}}",
			"could_not_start_dev_server": "Der Dev-Server konnte nicht gestartet werden.",
			"delete_failed": "Löschen fehlgeschlagen: {{error}}",
			"detect_failed": "Erkennung fehlgeschlagen: {{error}}",
			"dev_server_running": "Dev-Server läuft unter {{url}}.",
			"dev_server_stopped": "Dev-Server gestoppt — Vorschau von der Festplatte.",
			"failed": "Fehlgeschlagen: {{error}}",
			"follow_up_added": "Folgekommentar {{label}} zu Anfrage {{number}} hinzugefügt — noch nicht gesendet.",
			"follow_up_failed": "Folgekommentar fehlgeschlagen: {{error}}",
			"follow_up_origin_missing": "Der Kommentar, auf den sich der Folgekommentar bezieht, wurde nicht gefunden.",
			"looking_for_dev_server": "Suche nach einem Dev-Server…",
			"no_dev_server_found": "Kein Dev-Server für diesen Ordner gefunden — starten Sie ihn oder geben Sie die URL ein.",
			"opening_folder_picker": "Ordnerauswahl wird geöffnet…",
			"picker_unavailable": "Auswahldialog nicht verfügbar ({{error}}) — geben Sie stattdessen den Pfad ein.",
			"preview_refreshed": "Vorschau aktualisiert — {{label}} fertig",
			"previewing_from_disk": "{{name}} wird von der Festplatte in der Vorschau angezeigt.",
			"previewing_from_url": "{{name}} wird von {{url}} in der Vorschau angezeigt.",
			"remove_failed": "Entfernen fehlgeschlagen: {{error}}",
			"dispatch_failed_unconfirmed": "Anfrage {{number}} wurde abgeschlossen, aber die Zustellung ließ sich nicht bestätigen ({{error}}). Die Sitzung wird geprüft — die Liste aktualisiert sich.",
			"sent_request_to_session": "Anfrage {{number}} ({{n}}) gesendet → Sitzung {{label}}.",
			"no_session_for_request": "Anfrage {{number}} ist bereit, aber diese App hat keinen Ordner, also gibt es keine Sitzung zum Senden. Lege den Ordner der App fest und sende sie dann aus der Liste.",
			"servers_match_folder": "{{n}} Server passen zu diesem Ordner ({{ports}}) — wählen Sie einen aus.",
			"set_dev_server_for": "Dev-Server für {{name}} festgelegt.",
			"starting_command": "{{command}} wird gestartet…",
			"starting_dev_server": "Der Dev-Server wird gestartet…",
			"stop_failed": "Stoppen fehlgeschlagen: {{error}}",
			"unknown": "unbekannt",
			"unknown_error": "unbekannter Fehler",
			"using_running_dev_server": "Es wird der bereits unter {{url}} laufende Dev-Server verwendet."
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "Wähle Elemente in der Live-Vorschau deiner App visuell aus und verwandle sie in umfangsbezogene, quellcodeverknüpfte Änderungsanfragen für den Agenten — wie Figma-Kommentare, nur für Code.",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "Senden fehlgeschlagen",
			"send_failed_with_error": "Senden fehlgeschlagen: {{error}}",
			"accepted_body_unreadable": "Der Server hat die Anfrage angenommen, aber die Antwort konnte nicht gelesen werden.",
			"no_response_returned": "Keine Antwort"
		}
	},
	en: {
		comments: {
			"an_earlier_comment": "an earlier comment",
			"element_count": "{{n}} elements",
			"follow_up_to": "↩ follow-up to {{label}}",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "Click to open this comment in the preview",
			"remove_from_draft": "Remove this comment from the draft"
		},
		devServer: {
			"detect_hint": "Preview this project from its running dev server (keeps hot reload working)",
			"dev_server": "Dev server",
			"looking": "Looking…",
			"preview_from_disk_instead": "Preview from disk instead",
			"url_placeholder": "http://localhost:5173",
			"use": "Use"
		},
		layout: { "drag_to_resize": "Drag to resize" },
		modes: {
			"edit": "Edit",
			"preview": "Preview"
		},
		page: {
			"tagline": "Point, describe, and watch the code catch up.",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "The app backend did not answer. If you just changed it, toggle Design Tweak off and on in the Apps page.",
			"dev_server_not_reachable": "Dev server not reachable",
			"dim_desktop": "Desktop",
			"dim_mobile": "Mobile",
			"dim_tablet": "Tablet",
			"dimensions": "Dimensions",
			"fallback_name": "preview",
			"frame_title": "App preview",
			"loading_name": "Loading {{name}}…",
			"needs_dev_server_title": "This is a web app — it needs a dev server",
			"no_dev_script_in_package_json": "No dev script found in package.json — start it yourself, then press Dev server below.",
			"no_html_entry": "There is no HTML entry point to serve from disk, so it has to be built and served by its own dev server.",
			"not_reachable": "Preview not reachable",
			"nothing_answered_at": "Nothing answered at {{url}}. Start the dev server for this project, then retry — or clear its URL to preview the files from disk instead.",
			"refresh_preview": "Refresh preview",
			"retry": "Retry",
			"runs_command_in_project": "Runs {{command}} in {{name}}",
			"start_dev_server": "Start dev server",
			"starting": "Starting…",
			"timed_out": "timed out",
			"unbundled_entry": "Its entry point is {{entry}} — TypeScript/JSX, which a browser cannot run. The files have to be built as they are served, so there is nothing to preview from disk."
		},
		projects: {
			"add": "Add",
			"browse_or_type_path": "Browse for a folder, or type its path",
			"click_again_to_disconnect": "Click again to disconnect",
			"connect": "Connect",
			"connected": "Connected",
			"dev_badge": "dev",
			"load_new_app": "Load new app",
			"loading": "Loading…",
			"loading_your_apps": "Loading your apps…",
			"looking_for_connected_apps": "Looking for your connected apps…",
			"needs_dev_server": "Needs a dev server ({{command}})",
			"no_app_selected": "No web app selected. Pick one in the dropdown — switching is instant.",
			"no_dev_script": "no dev script found",
			"none_loaded": "No web apps loaded yet.",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "Previewing from {{url}}",
			"remove_from_list": "Remove from list",
			"select_app": "Select a web app…"
		},
		requests: {
			"archive_to_history": "Archive to History",
			"chip_done": "{{n}} done",
			"chip_in_progress": "{{n}} in progress",
			"chip_not_sent": "{{n}} not sent",
			"chip_queued": "{{n}} queued",
			"delete_confirm": "Delete Request {{number}}? Its comments are removed permanently — this cannot be undone.",
			"delete_request": "Delete request",
			"empty_for_app": "No edit requests for {{name}} yet. Switch the preview to Edit mode, right-click an element, and describe the change. Comments collect into a request you send as a batch.",
			"empty_no_app": "No web app connected. Pick one in the dropdown above — each app keeps its own requests, history, and chat session.",
			"history": "History",
			"more_actions": "More actions for Request {{number}}",
			"no_comments": "No comments yet.",
			"open_in_chat": "Open in chat",
			"request_number": "Request {{number}}",
			"sending": "Sending…",
			"send_request": "Send as Request {{number}}",
			"send_missing_request": "Send Request {{number}}",
			"this_app": "this app"
		},
		status: {
			"add_failed": "Add failed: {{error}}",
			"added_comment": "Added {{label}} — {{n}} in Request {{number}}, not sent yet.",
			"added_dev_previewing": "Added {{name}} (dev server) — previewing.",
			"added_found_dev_server": "Added {{name}} — found its dev server at {{url}}.",
			"added_many_dev_servers": "Added {{name}} — {{n}} dev servers match this folder, so none was assumed. Set one in the dropdown.",
			"added_previewing": "Added {{name}} — previewing.",
			"already_registered": "Already registered — switched to {{name}}.",
			"already_sent": "Request {{number}} was already sent.",
			"archive_failed": "Archive failed: {{error}}",
			"capture_failed": "Capture failed: {{error}}",
			"could_not_start_dev_server": "Could not start the dev server.",
			"delete_failed": "Delete failed: {{error}}",
			"detect_failed": "Detect failed: {{error}}",
			"dev_server_running": "Dev server running at {{url}}.",
			"dev_server_stopped": "Dev server stopped — previewing from disk.",
			"failed": "Failed: {{error}}",
			"follow_up_added": "Follow-up {{label}} added to Request {{number}} — not sent yet.",
			"follow_up_failed": "Follow-up failed: {{error}}",
			"follow_up_origin_missing": "Could not find that comment to follow up on.",
			"looking_for_dev_server": "Looking for a dev server…",
			"no_dev_server_found": "No dev server found for this folder — start it, or type the URL.",
			"opening_folder_picker": "Opening folder picker…",
			"picker_unavailable": "Picker unavailable ({{error}}) — type the path instead.",
			"preview_refreshed": "Preview refreshed — {{label}} done",
			"previewing_from_disk": "Previewing {{name}} from disk.",
			"previewing_from_url": "Previewing {{name}} from {{url}}.",
			"remove_failed": "Remove failed: {{error}}",
			"dispatch_failed_unconfirmed": "Request {{number}} was sealed but delivery could not be confirmed ({{error}}). Checking the session — the list will update.",
			"sent_request_to_session": "Sent Request {{number}} ({{n}}) → {{label}} session.",
			"no_session_for_request": "Request {{number}} is ready but this app has no folder, so there is no session to send it to. Set the app's folder, then send it from the list.",
			"servers_match_folder": "{{n}} servers match this folder ({{ports}}) — pick one.",
			"set_dev_server_for": "Set dev server for {{name}}.",
			"starting_command": "Starting {{command}}…",
			"starting_dev_server": "Starting the dev server…",
			"stop_failed": "Stop failed: {{error}}",
			"unknown": "unknown",
			"unknown_error": "unknown error",
			"using_running_dev_server": "Using the dev server already running at {{url}}."
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "Visually select elements in your live app preview and turn them into scoped, source-mapped edit requests for the agent — like Figma comments, but for code.",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "Send failed",
			"send_failed_with_error": "Send failed: {{error}}",
			"accepted_body_unreadable": "The server accepted the request, but its reply could not be read.",
			"no_response_returned": "No response returned"
		}
	},
	es: {
		comments: {
			"an_earlier_comment": "un comentario anterior",
			"element_count": "{{n}} elementos",
			"follow_up_to": "↩ seguimiento de {{label}}",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "Haz clic para abrir este comentario en la vista previa",
			"remove_from_draft": "Eliminar este comentario del borrador"
		},
		devServer: {
			"detect_hint": "Ver la vista previa de este proyecto desde su servidor de desarrollo en ejecución (mantiene la recarga en vivo)",
			"dev_server": "Servidor de desarrollo",
			"looking": "Buscando…",
			"preview_from_disk_instead": "Ver la vista previa desde el disco en su lugar",
			"url_placeholder": "http://localhost:5173",
			"use": "Usar"
		},
		layout: { "drag_to_resize": "Arrastra para redimensionar" },
		modes: {
			"edit": "Editar",
			"preview": "Vista previa"
		},
		page: {
			"tagline": "Señala, describe y observa cómo el código se pone al día.",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "El backend de la app no respondió. Si acabas de cambiarlo, desactiva y vuelve a activar Design Tweak en la página Apps.",
			"dev_server_not_reachable": "No se puede acceder al servidor de desarrollo",
			"dim_desktop": "Escritorio",
			"dim_mobile": "Móvil",
			"dim_tablet": "Tableta",
			"dimensions": "Dimensiones",
			"fallback_name": "vista previa",
			"frame_title": "Vista previa de la app",
			"loading_name": "Cargando {{name}}…",
			"needs_dev_server_title": "Esta es una app web — necesita un servidor de desarrollo",
			"no_dev_script_in_package_json": "No se encontró ningún script dev en package.json — inícialo tú mismo y luego pulsa Servidor de desarrollo abajo.",
			"no_html_entry": "No hay ningún punto de entrada HTML que servir desde el disco, así que su propio servidor de desarrollo tiene que compilarlo y servirlo.",
			"not_reachable": "No se puede acceder a la vista previa",
			"nothing_answered_at": "Nada respondió en {{url}}. Inicia el servidor de desarrollo de este proyecto y reinténtalo — o borra su URL para ver la vista previa de los archivos desde el disco.",
			"refresh_preview": "Actualizar la vista previa",
			"retry": "Reintentar",
			"runs_command_in_project": "Ejecuta {{command}} en {{name}}",
			"start_dev_server": "Iniciar el servidor de desarrollo",
			"starting": "Iniciando…",
			"timed_out": "tiempo de espera agotado",
			"unbundled_entry": "Su punto de entrada es {{entry}} — TypeScript/JSX, que un navegador no puede ejecutar. Los archivos tienen que compilarse a medida que se sirven, así que no hay ninguna vista previa que servir desde el disco."
		},
		projects: {
			"add": "Añadir",
			"browse_or_type_path": "Busca una carpeta o escribe su ruta",
			"click_again_to_disconnect": "Haz clic de nuevo para desconectar",
			"connect": "Conectar",
			"connected": "Conectada",
			"dev_badge": "dev",
			"load_new_app": "Cargar una app nueva",
			"loading": "Cargando…",
			"loading_your_apps": "Cargando tus apps…",
			"looking_for_connected_apps": "Buscando tus apps conectadas…",
			"needs_dev_server": "Necesita un servidor de desarrollo ({{command}})",
			"no_app_selected": "No hay ninguna app web seleccionada. Elige una en el menú desplegable — cambiar es instantáneo.",
			"no_dev_script": "no se encontró ningún script dev",
			"none_loaded": "Aún no hay ninguna app web cargada.",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "Vista previa desde {{url}}",
			"remove_from_list": "Quitar de la lista",
			"select_app": "Selecciona una app web…"
		},
		requests: {
			"archive_to_history": "Archivar en el historial",
			"chip_done": "{{n}} completados",
			"chip_in_progress": "{{n}} en curso",
			"chip_not_sent": "{{n}} sin enviar",
			"chip_queued": "{{n}} en cola",
			"delete_confirm": "¿Eliminar la solicitud {{number}}? Sus comentarios se eliminan de forma permanente y no se puede deshacer.",
			"delete_request": "Eliminar la solicitud",
			"empty_for_app": "Aún no hay solicitudes de edición para {{name}}. Cambia la vista previa al modo Editar, haz clic con el botón derecho en un elemento y describe el cambio. Los comentarios se agrupan en una solicitud que envías por lotes.",
			"empty_no_app": "No hay ninguna app web conectada. Elige una en el menú desplegable de arriba — cada app conserva sus propias solicitudes, su historial y su sesión de chat.",
			"history": "Historial",
			"more_actions": "Más acciones para la solicitud {{number}}",
			"no_comments": "Aún no hay comentarios.",
			"open_in_chat": "Abrir en el chat",
			"request_number": "Solicitud {{number}}",
			"sending": "Enviando…",
			"send_request": "Enviar como solicitud {{number}}",
			"send_missing_request": "Enviar solicitud {{number}}",
			"this_app": "esta app"
		},
		status: {
			"add_failed": "Error al añadir: {{error}}",
			"added_comment": "Se añadió {{label}} — {{n}} en la solicitud {{number}}, aún sin enviar.",
			"added_dev_previewing": "Se añadió {{name}} (servidor de desarrollo) — mostrando la vista previa.",
			"added_found_dev_server": "Se añadió {{name}} — se encontró su servidor de desarrollo en {{url}}.",
			"added_many_dev_servers": "Se añadió {{name}} — {{n}} servidores de desarrollo coinciden con esta carpeta, así que no se dio ninguno por supuesto. Elige uno en el menú desplegable.",
			"added_previewing": "Se añadió {{name}} — mostrando la vista previa.",
			"already_registered": "Ya estaba registrada — se cambió a {{name}}.",
			"already_sent": "La solicitud {{number}} ya se envió.",
			"archive_failed": "Error al archivar: {{error}}",
			"capture_failed": "Error al capturar: {{error}}",
			"could_not_start_dev_server": "No se pudo iniciar el servidor de desarrollo.",
			"delete_failed": "Error al eliminar: {{error}}",
			"detect_failed": "Error al detectar: {{error}}",
			"dev_server_running": "El servidor de desarrollo está en ejecución en {{url}}.",
			"dev_server_stopped": "Servidor de desarrollo detenido — mostrando la vista previa desde el disco.",
			"failed": "Error: {{error}}",
			"follow_up_added": "Seguimiento {{label}} añadido a la solicitud {{number}} — aún sin enviar.",
			"follow_up_failed": "Error en el seguimiento: {{error}}",
			"follow_up_origin_missing": "No se encontró ese comentario para hacerle seguimiento.",
			"looking_for_dev_server": "Buscando un servidor de desarrollo…",
			"no_dev_server_found": "No se encontró ningún servidor de desarrollo para esta carpeta — inícialo o escribe la URL.",
			"opening_folder_picker": "Abriendo el selector de carpetas…",
			"picker_unavailable": "Selector no disponible ({{error}}) — escribe la ruta en su lugar.",
			"preview_refreshed": "Vista previa actualizada — {{label}} listo",
			"previewing_from_disk": "Mostrando la vista previa de {{name}} desde el disco.",
			"previewing_from_url": "Mostrando la vista previa de {{name}} desde {{url}}.",
			"remove_failed": "Error al quitar: {{error}}",
			"dispatch_failed_unconfirmed": "La solicitud {{number}} se cerró, pero no se pudo confirmar la entrega ({{error}}). Se está comprobando la sesión; la lista se actualizará.",
			"sent_request_to_session": "Se envió la solicitud {{number}} ({{n}}) → sesión {{label}}.",
			"no_session_for_request": "La solicitud {{number}} está lista, pero esta aplicación no tiene carpeta, así que no hay sesión a la que enviarla. Define la carpeta de la aplicación y envíala desde la lista.",
			"servers_match_folder": "{{n}} servidores coinciden con esta carpeta ({{ports}}) — elige uno.",
			"set_dev_server_for": "Servidor de desarrollo configurado para {{name}}.",
			"starting_command": "Iniciando {{command}}…",
			"starting_dev_server": "Iniciando el servidor de desarrollo…",
			"stop_failed": "Error al detener: {{error}}",
			"unknown": "desconocido",
			"unknown_error": "error desconocido",
			"using_running_dev_server": "Usando el servidor de desarrollo que ya está en ejecución en {{url}}."
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "Selecciona visualmente elementos en la vista previa en vivo de tu app y conviértelos en solicitudes de edición acotadas y vinculadas al código fuente para el agente — como comentarios de Figma, pero para código.",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "Error al enviar",
			"send_failed_with_error": "Error al enviar: {{error}}",
			"accepted_body_unreadable": "El servidor aceptó la solicitud, pero no se pudo leer la respuesta.",
			"no_response_returned": "Sin respuesta"
		}
	},
	fr: {
		comments: {
			"an_earlier_comment": "un commentaire précédent",
			"element_count": "{{n}} éléments",
			"follow_up_to": "↩ suivi de {{label}}",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "Cliquer pour ouvrir ce commentaire dans l'aperçu",
			"remove_from_draft": "Retirer ce commentaire du brouillon"
		},
		devServer: {
			"detect_hint": "Prévisualiser ce projet depuis son serveur de développement en cours d'exécution (conserve le rechargement à chaud)",
			"dev_server": "Serveur de développement",
			"looking": "Recherche…",
			"preview_from_disk_instead": "Prévisualiser plutôt depuis le disque",
			"url_placeholder": "http://localhost:5173",
			"use": "Utiliser"
		},
		layout: { "drag_to_resize": "Glisser pour redimensionner" },
		modes: {
			"edit": "Modifier",
			"preview": "Aperçu"
		},
		page: {
			"tagline": "Pointez, décrivez, et regardez le code suivre.",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "Le backend de l'application n'a pas répondu. Si vous venez de le modifier, désactivez puis réactivez Design Tweak dans la page Applications.",
			"dev_server_not_reachable": "Serveur de développement inaccessible",
			"dim_desktop": "Bureau",
			"dim_mobile": "Mobile",
			"dim_tablet": "Tablette",
			"dimensions": "Dimensions",
			"fallback_name": "aperçu",
			"frame_title": "Aperçu de l’application",
			"loading_name": "Chargement de {{name}}…",
			"needs_dev_server_title": "Il s'agit d'une application web — elle nécessite un serveur de développement",
			"no_dev_script_in_package_json": "Aucun script dev trouvé dans package.json — démarrez-le vous-même, puis appuyez sur Serveur de développement ci-dessous.",
			"no_html_entry": "Il n'y a aucun point d'entrée HTML à servir depuis le disque ; elle doit donc être compilée et servie par son propre serveur de développement.",
			"not_reachable": "Aperçu inaccessible",
			"nothing_answered_at": "Aucune réponse à {{url}}. Démarrez le serveur de développement de ce projet, puis réessayez — ou effacez son URL pour prévisualiser les fichiers depuis le disque.",
			"refresh_preview": "Actualiser l'aperçu",
			"retry": "Réessayer",
			"runs_command_in_project": "Exécute {{command}} dans {{name}}",
			"start_dev_server": "Démarrer le serveur de développement",
			"starting": "Démarrage…",
			"timed_out": "délai dépassé",
			"unbundled_entry": "Son point d'entrée est {{entry}} — du TypeScript/JSX, qu'un navigateur ne peut pas exécuter. Les fichiers doivent être compilés au moment où ils sont servis, il n'y a donc rien à prévisualiser depuis le disque."
		},
		projects: {
			"add": "Ajouter",
			"browse_or_type_path": "Parcourir pour choisir un dossier, ou saisir son chemin",
			"click_again_to_disconnect": "Cliquez à nouveau pour déconnecter",
			"connect": "Connecter",
			"connected": "Connecté",
			"dev_badge": "dev",
			"load_new_app": "Charger une nouvelle application",
			"loading": "Chargement…",
			"loading_your_apps": "Chargement de vos applications…",
			"looking_for_connected_apps": "Recherche de vos applications connectées…",
			"needs_dev_server": "Nécessite un serveur de développement ({{command}})",
			"no_app_selected": "Aucune application web sélectionnée. Choisissez-en une dans la liste déroulante — le changement est instantané.",
			"no_dev_script": "aucun script dev trouvé",
			"none_loaded": "Aucune application web chargée pour l'instant.",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "Aperçu depuis {{url}}",
			"remove_from_list": "Retirer de la liste",
			"select_app": "Sélectionner une application web…"
		},
		requests: {
			"archive_to_history": "Archiver dans l'historique",
			"chip_done": "{{n}} terminé(s)",
			"chip_in_progress": "{{n}} en cours",
			"chip_not_sent": "{{n}} non envoyé(s)",
			"chip_queued": "{{n}} en attente",
			"delete_confirm": "Supprimer la demande {{number}} ? Ses commentaires sont supprimés définitivement — cette action est irréversible.",
			"delete_request": "Supprimer la demande",
			"empty_for_app": "Aucune demande de modification pour {{name}} pour l'instant. Basculez l'aperçu en mode Modifier, faites un clic droit sur un élément et décrivez le changement. Les commentaires s'accumulent dans une demande que vous envoyez par lot.",
			"empty_no_app": "Aucune application web connectée. Choisissez-en une dans la liste déroulante ci-dessus — chaque application conserve ses propres demandes, son historique et sa session de chat.",
			"history": "Historique",
			"more_actions": "Autres actions pour la demande {{number}}",
			"no_comments": "Aucun commentaire pour l'instant.",
			"open_in_chat": "Ouvrir dans le chat",
			"request_number": "Demande {{number}}",
			"sending": "Envoi…",
			"send_request": "Envoyer comme demande {{number}}",
			"send_missing_request": "Envoyer la demande {{number}}",
			"this_app": "cette application"
		},
		status: {
			"add_failed": "Échec de l'ajout : {{error}}",
			"added_comment": "{{label}} ajouté — {{n}} dans la demande {{number}}, pas encore envoyée.",
			"added_dev_previewing": "{{name}} ajouté (serveur de développement) — aperçu en cours.",
			"added_found_dev_server": "{{name}} ajouté — son serveur de développement a été trouvé à {{url}}.",
			"added_many_dev_servers": "{{name}} ajouté — {{n}} serveurs de développement correspondent à ce dossier, aucun n'a donc été supposé. Choisissez-en un dans la liste déroulante.",
			"added_previewing": "{{name}} ajouté — aperçu en cours.",
			"already_registered": "Déjà enregistré — basculé sur {{name}}.",
			"already_sent": "La demande {{number}} a déjà été envoyée.",
			"archive_failed": "Échec de l'archivage : {{error}}",
			"capture_failed": "Échec de la capture : {{error}}",
			"could_not_start_dev_server": "Impossible de démarrer le serveur de développement.",
			"delete_failed": "Échec de la suppression : {{error}}",
			"detect_failed": "Échec de la détection : {{error}}",
			"dev_server_running": "Serveur de développement en cours d'exécution à {{url}}.",
			"dev_server_stopped": "Serveur de développement arrêté — aperçu depuis le disque.",
			"failed": "Échec : {{error}}",
			"follow_up_added": "Suivi {{label}} ajouté à la demande {{number}} — pas encore envoyée.",
			"follow_up_failed": "Échec du suivi : {{error}}",
			"follow_up_origin_missing": "Impossible de trouver ce commentaire à suivre.",
			"looking_for_dev_server": "Recherche d'un serveur de développement…",
			"no_dev_server_found": "Aucun serveur de développement trouvé pour ce dossier — démarrez-le, ou saisissez l'URL.",
			"opening_folder_picker": "Ouverture du sélecteur de dossier…",
			"picker_unavailable": "Sélecteur indisponible ({{error}}) — saisissez plutôt le chemin.",
			"preview_refreshed": "Aperçu actualisé — {{label}} terminé",
			"previewing_from_disk": "Aperçu de {{name}} depuis le disque.",
			"previewing_from_url": "Aperçu de {{name}} depuis {{url}}.",
			"remove_failed": "Échec du retrait : {{error}}",
			"dispatch_failed_unconfirmed": "La demande {{number}} a été scellée, mais la livraison n'a pas pu être confirmée ({{error}}). Vérification de la session — la liste se mettra à jour.",
			"sent_request_to_session": "Demande {{number}} ({{n}}) → session {{label}}.",
			"no_session_for_request": "La demande {{number}} est prête, mais cette application n'a pas de dossier, donc aucune session ne peut la recevoir. Définis le dossier de l'application, puis envoie-la depuis la liste.",
			"servers_match_folder": "{{n}} serveurs correspondent à ce dossier ({{ports}}) — choisissez-en un.",
			"set_dev_server_for": "Serveur de développement défini pour {{name}}.",
			"starting_command": "Démarrage de {{command}}…",
			"starting_dev_server": "Démarrage du serveur de développement…",
			"stop_failed": "Échec de l'arrêt : {{error}}",
			"unknown": "inconnu",
			"unknown_error": "erreur inconnue",
			"using_running_dev_server": "Utilisation du serveur de développement déjà en cours d'exécution à {{url}}."
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "Sélectionnez visuellement des éléments dans l'aperçu en direct de votre application et transformez-les en demandes de modification ciblées et liées au code source pour l'agent — comme des commentaires Figma, mais pour le code.",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "Échec de l’envoi",
			"send_failed_with_error": "Échec de l'envoi : {{error}}",
			"accepted_body_unreadable": "Le serveur a accepté la requête, mais la réponse n'a pas pu être lue.",
			"no_response_returned": "Aucune réponse"
		}
	},
	hi: {
		comments: {
			"an_earlier_comment": "एक पुरानी टिप्पणी",
			"element_count": "{{n}} एलिमेंट",
			"follow_up_to": "↩ {{label}} पर फ़ॉलो-अप",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "इस टिप्पणी को पूर्वावलोकन में खोलने के लिए क्लिक करें",
			"remove_from_draft": "इस टिप्पणी को ड्राफ़्ट से हटाएँ"
		},
		devServer: {
			"detect_hint": "इस प्रोजेक्ट का पूर्वावलोकन इसके चल रहे dev server से करें (hot reload काम करता रहता है)",
			"dev_server": "Dev server",
			"looking": "ढूँढा जा रहा है…",
			"preview_from_disk_instead": "इसके बजाय डिस्क से पूर्वावलोकन करें",
			"url_placeholder": "http://localhost:5173",
			"use": "उपयोग करें"
		},
		layout: { "drag_to_resize": "आकार बदलने के लिए खींचें" },
		modes: {
			"edit": "संपादन",
			"preview": "पूर्वावलोकन"
		},
		page: {
			"tagline": "इशारा करें, बताएँ, और कोड को साथ आते देखें।",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "ऐप बैकएंड ने जवाब नहीं दिया। अगर इसमें अभी बदलाव किया है, तो ऐप्स पेज में Design Tweak को बंद करके फिर चालू करें।",
			"dev_server_not_reachable": "dev server तक पहुँच नहीं",
			"dim_desktop": "डेस्कटॉप",
			"dim_mobile": "मोबाइल",
			"dim_tablet": "टैबलेट",
			"dimensions": "आयाम",
			"fallback_name": "पूर्वावलोकन",
			"frame_title": "ऐप प्रीव्यू",
			"loading_name": "{{name}} लोड हो रहा है…",
			"needs_dev_server_title": "यह एक वेब ऐप है — इसे dev server चाहिए",
			"no_dev_script_in_package_json": "package.json में कोई dev स्क्रिप्ट नहीं मिली — इसे खुद शुरू करें, फिर नीचे Dev server दबाएँ।",
			"no_html_entry": "डिस्क से सर्व करने के लिए कोई HTML एंट्री पॉइंट नहीं है, इसलिए इसे इसके अपने dev server से बिल्ड और सर्व करना होगा।",
			"not_reachable": "पूर्वावलोकन तक पहुँच नहीं",
			"nothing_answered_at": "{{url}} पर किसी ने जवाब नहीं दिया। इस प्रोजेक्ट के लिए dev server शुरू करें, फिर कोशिश करें — या इसका URL हटा दें ताकि फ़ाइलों का पूर्वावलोकन डिस्क से हो।",
			"refresh_preview": "पूर्वावलोकन रीफ़्रेश करें",
			"retry": "फिर कोशिश करें",
			"runs_command_in_project": "{{name}} में {{command}} चलाता है",
			"start_dev_server": "dev server शुरू करें",
			"starting": "शुरू हो रहा है…",
			"timed_out": "समय समाप्त",
			"unbundled_entry": "इसका एंट्री पॉइंट {{entry}} है — TypeScript/JSX, जिसे ब्राउज़र चला नहीं सकता। फ़ाइलों को सर्व करते समय ही बिल्ड करना पड़ता है, इसलिए डिस्क से पूर्वावलोकन के लिए कुछ नहीं है।"
		},
		projects: {
			"add": "जोड़ें",
			"browse_or_type_path": "फ़ोल्डर ब्राउज़ करें, या उसका पथ लिखें",
			"click_again_to_disconnect": "डिस्कनेक्ट करने के लिए फिर क्लिक करें",
			"connect": "कनेक्ट करें",
			"connected": "कनेक्टेड",
			"dev_badge": "dev",
			"load_new_app": "नया ऐप लोड करें",
			"loading": "लोड हो रहा है…",
			"loading_your_apps": "ऐप्स लोड हो रहे हैं…",
			"looking_for_connected_apps": "कनेक्टेड ऐप्स ढूँढे जा रहे हैं…",
			"needs_dev_server": "dev server चाहिए ({{command}})",
			"no_app_selected": "कोई वेब ऐप चुना नहीं गया। ड्रॉपडाउन से एक चुनें — बदलना तुरंत होता है।",
			"no_dev_script": "कोई dev स्क्रिप्ट नहीं मिली",
			"none_loaded": "अभी कोई वेब ऐप लोड नहीं हुआ।",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "{{url}} से पूर्वावलोकन हो रहा है",
			"remove_from_list": "सूची से हटाएँ",
			"select_app": "कोई वेब ऐप चुनें…"
		},
		requests: {
			"archive_to_history": "इतिहास में आर्काइव करें",
			"chip_done": "{{n}} पूर्ण",
			"chip_in_progress": "{{n}} चल रहे",
			"chip_not_sent": "{{n}} नहीं भेजे गए",
			"chip_queued": "{{n}} कतार में",
			"delete_confirm": "अनुरोध {{number}} हटाएँ? इसकी टिप्पणियाँ स्थायी रूप से हट जाएँगी — इसे पहले जैसा नहीं किया जा सकता।",
			"delete_request": "अनुरोध हटाएँ",
			"empty_for_app": "{{name}} के लिए अभी कोई संपादन अनुरोध नहीं है। पूर्वावलोकन को संपादन मोड पर लाएँ, किसी एलिमेंट पर राइट-क्लिक करें, और बदलाव बताएँ। टिप्पणियाँ एक अनुरोध में जमा होती हैं, जिसे बैच के रूप में भेजा जाता है।",
			"empty_no_app": "कोई वेब ऐप कनेक्टेड नहीं है। ऊपर ड्रॉपडाउन से एक चुनें — हर ऐप अपने अनुरोध, इतिहास और चैट सेशन अलग रखता है।",
			"history": "इतिहास",
			"more_actions": "रिक्वेस्ट {{number}} के लिए और कार्रवाइयाँ",
			"no_comments": "अभी कोई टिप्पणी नहीं है।",
			"open_in_chat": "चैट में खोलें",
			"request_number": "अनुरोध {{number}}",
			"sending": "भेजा जा रहा है…",
			"send_request": "अनुरोध {{number}} के रूप में भेजें",
			"send_missing_request": "अनुरोध {{number}} भेजें",
			"this_app": "यह ऐप"
		},
		status: {
			"add_failed": "जोड़ना विफल: {{error}}",
			"added_comment": "{{label}} जोड़ा गया — अनुरोध {{number}} में {{n}}, अभी भेजा नहीं गया।",
			"added_dev_previewing": "{{name}} जोड़ा गया (dev server) — पूर्वावलोकन हो रहा है।",
			"added_found_dev_server": "{{name}} जोड़ा गया — इसका dev server {{url}} पर मिला।",
			"added_many_dev_servers": "{{name}} जोड़ा गया — {{n}} dev server इस फ़ोल्डर से मेल खाते हैं, इसलिए कोई नहीं मान लिया गया। ड्रॉपडाउन में एक सेट करें।",
			"added_previewing": "{{name}} जोड़ा गया — पूर्वावलोकन हो रहा है।",
			"already_registered": "पहले से रजिस्टर्ड — {{name}} पर बदल दिया।",
			"already_sent": "अनुरोध {{number}} पहले ही भेज दिया गया।",
			"archive_failed": "आर्काइव विफल: {{error}}",
			"capture_failed": "कैप्चर विफल: {{error}}",
			"could_not_start_dev_server": "dev server शुरू नहीं हो सका।",
			"delete_failed": "डिलीट विफल: {{error}}",
			"detect_failed": "पहचान विफल: {{error}}",
			"dev_server_running": "dev server {{url}} पर चल रहा है।",
			"dev_server_stopped": "dev server रुक गया — पूर्वावलोकन डिस्क से हो रहा है।",
			"failed": "विफल: {{error}}",
			"follow_up_added": "फ़ॉलो-अप {{label}} अनुरोध {{number}} में जोड़ा गया — अभी भेजा नहीं गया।",
			"follow_up_failed": "फ़ॉलो-अप विफल: {{error}}",
			"follow_up_origin_missing": "फ़ॉलो-अप करने के लिए वह टिप्पणी नहीं मिली।",
			"looking_for_dev_server": "dev server ढूँढा जा रहा है…",
			"no_dev_server_found": "इस फ़ोल्डर के लिए कोई dev server नहीं मिला — इसे शुरू करें, या URL लिखें।",
			"opening_folder_picker": "फ़ोल्डर पिकर खोला जा रहा है…",
			"picker_unavailable": "पिकर अनुपलब्ध ({{error}}) — इसके बजाय पथ लिखें।",
			"preview_refreshed": "पूर्वावलोकन रीफ़्रेश हुआ — {{label}} पूर्ण",
			"previewing_from_disk": "{{name}} का पूर्वावलोकन डिस्क से हो रहा है।",
			"previewing_from_url": "{{name}} का पूर्वावलोकन {{url}} से हो रहा है।",
			"remove_failed": "हटाना विफल: {{error}}",
			"dispatch_failed_unconfirmed": "अनुरोध {{number}} सील हो गया, लेकिन डिलीवरी की पुष्टि नहीं हो सकी ({{error}})। सत्र जाँचा जा रहा है — सूची अपडेट हो जाएगी।",
			"sent_request_to_session": "अनुरोध {{number}} ({{n}}) → {{label}} सेशन को भेज दिया।",
			"no_session_for_request": "अनुरोध {{number}} तैयार है, लेकिन इस ऐप का कोई फ़ोल्डर नहीं है, इसलिए भेजने के लिए कोई सत्र नहीं है। ऐप का फ़ोल्डर सेट करो, फिर सूची से भेजो।",
			"servers_match_folder": "{{n}} सर्वर इस फ़ोल्डर से मेल खाते हैं ({{ports}}) — एक चुनें।",
			"set_dev_server_for": "{{name}} के लिए dev server सेट कर दिया।",
			"starting_command": "{{command}} शुरू हो रहा है…",
			"starting_dev_server": "dev server शुरू हो रहा है…",
			"stop_failed": "रोकना विफल: {{error}}",
			"unknown": "अज्ञात",
			"unknown_error": "अज्ञात त्रुटि",
			"using_running_dev_server": "{{url}} पर पहले से चल रहे dev server का उपयोग किया जा रहा है।"
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "अपने लाइव ऐप प्रीव्यू में एलिमेंट्स को विज़ुअली सिलेक्ट करें और उन्हें एजेंट के लिए स्कोप्ड, सोर्स-मैप्ड एडिट रिक्वेस्ट में बदलें — Figma कमेंट्स की तरह, लेकिन कोड के लिए।",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "भेजना विफल",
			"send_failed_with_error": "भेजना विफल: {{error}}",
			"accepted_body_unreadable": "सर्वर ने अनुरोध स्वीकार कर लिया, लेकिन उसका जवाब पढ़ा नहीं जा सका।",
			"no_response_returned": "कोई प्रतिक्रिया नहीं मिली"
		}
	},
	it: {
		comments: {
			"an_earlier_comment": "un commento precedente",
			"element_count": "{{n}} elementi",
			"follow_up_to": "↩ seguito di {{label}}",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "Clicca per aprire questo commento nell'anteprima",
			"remove_from_draft": "Rimuovi questo commento dalla bozza"
		},
		devServer: {
			"detect_hint": "Vedi l'anteprima di questo progetto dal suo server di sviluppo in esecuzione (mantiene attivo il ricaricamento in tempo reale)",
			"dev_server": "Server di sviluppo",
			"looking": "Ricerca in corso…",
			"preview_from_disk_instead": "Vedi invece l'anteprima da disco",
			"url_placeholder": "http://localhost:5173",
			"use": "Usa"
		},
		layout: { "drag_to_resize": "Trascina per ridimensionare" },
		modes: {
			"edit": "Modifica",
			"preview": "Anteprima"
		},
		page: {
			"tagline": "Indica, descrivi e guarda il codice adeguarsi.",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "Il backend dell'app non ha risposto. Se l'hai appena modificato, disattiva e riattiva Design Tweak nella pagina App.",
			"dev_server_not_reachable": "Server di sviluppo non raggiungibile",
			"dim_desktop": "Desktop",
			"dim_mobile": "Mobile",
			"dim_tablet": "Tablet",
			"dimensions": "Dimensioni",
			"fallback_name": "anteprima",
			"frame_title": "Anteprima dell’app",
			"loading_name": "Caricamento di {{name}}…",
			"needs_dev_server_title": "Questa è un'app web — richiede un server di sviluppo",
			"no_dev_script_in_package_json": "Nessuno script dev trovato in package.json — avvialo tu, poi premi Server di sviluppo qui sotto.",
			"no_html_entry": "Non c'è alcun punto di ingresso HTML da servire da disco, quindi deve essere compilata e servita dal suo server di sviluppo.",
			"not_reachable": "Anteprima non raggiungibile",
			"nothing_answered_at": "Nessuna risposta da {{url}}. Avvia il server di sviluppo per questo progetto, poi riprova — oppure cancella il suo URL per vedere l'anteprima dei file da disco.",
			"refresh_preview": "Aggiorna l'anteprima",
			"retry": "Riprova",
			"runs_command_in_project": "Esegue {{command}} in {{name}}",
			"start_dev_server": "Avvia il server di sviluppo",
			"starting": "Avvio in corso…",
			"timed_out": "tempo scaduto",
			"unbundled_entry": "Il suo punto di ingresso è {{entry}} — TypeScript/JSX, che un browser non può eseguire. I file devono essere compilati mentre vengono serviti, quindi non c'è nulla di cui vedere l'anteprima da disco."
		},
		projects: {
			"add": "Aggiungi",
			"browse_or_type_path": "Sfoglia per scegliere una cartella, oppure digita il suo percorso",
			"click_again_to_disconnect": "Clicca di nuovo per disconnettere",
			"connect": "Connetti",
			"connected": "Connessa",
			"dev_badge": "dev",
			"load_new_app": "Carica una nuova app",
			"loading": "Caricamento…",
			"loading_your_apps": "Caricamento delle tue app…",
			"looking_for_connected_apps": "Ricerca delle tue app connesse…",
			"needs_dev_server": "Richiede un server di sviluppo ({{command}})",
			"no_app_selected": "Nessuna app web selezionata. Scegline una nel menu a tendina — il passaggio è immediato.",
			"no_dev_script": "nessuno script dev trovato",
			"none_loaded": "Nessuna app web caricata finora.",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "Anteprima da {{url}}",
			"remove_from_list": "Rimuovi dall'elenco",
			"select_app": "Seleziona un'app web…"
		},
		requests: {
			"archive_to_history": "Archivia nella cronologia",
			"chip_done": "{{n}} completati",
			"chip_in_progress": "{{n}} in corso",
			"chip_not_sent": "{{n}} non inviati",
			"chip_queued": "{{n}} in coda",
			"delete_confirm": "Eliminare la richiesta {{number}}? I suoi commenti vengono rimossi definitivamente — l'operazione non può essere annullata.",
			"delete_request": "Elimina la richiesta",
			"empty_for_app": "Nessuna richiesta di modifica per {{name}} finora. Imposta l'anteprima in modalità Modifica, fai clic destro su un elemento e descrivi la modifica. I commenti si raccolgono in una richiesta che invii in blocco.",
			"empty_no_app": "Nessuna app web connessa. Scegline una nel menu a tendina qui sopra — ogni app mantiene le proprie richieste, la propria cronologia e la propria sessione di chat.",
			"history": "Cronologia",
			"more_actions": "Altre azioni per la richiesta {{number}}",
			"no_comments": "Nessun commento finora.",
			"open_in_chat": "Apri nella chat",
			"request_number": "Richiesta {{number}}",
			"sending": "Invio in corso…",
			"send_request": "Invia come Richiesta {{number}}",
			"send_missing_request": "Invia la richiesta {{number}}",
			"this_app": "questa app"
		},
		status: {
			"add_failed": "Aggiunta non riuscita: {{error}}",
			"added_comment": "Aggiunto {{label}} — {{n}} nella Richiesta {{number}}, non ancora inviata.",
			"added_dev_previewing": "{{name}} aggiunta (server di sviluppo) — anteprima in corso.",
			"added_found_dev_server": "{{name}} aggiunta — trovato il suo server di sviluppo su {{url}}.",
			"added_many_dev_servers": "{{name}} aggiunta — {{n}} server di sviluppo corrispondono a questa cartella, quindi non ne è stato scelto nessuno. Impostane uno nel menu a tendina.",
			"added_previewing": "{{name}} aggiunta — anteprima in corso.",
			"already_registered": "Già registrata — passato a {{name}}.",
			"already_sent": "La richiesta {{number}} è già stata inviata.",
			"archive_failed": "Archiviazione non riuscita: {{error}}",
			"capture_failed": "Acquisizione non riuscita: {{error}}",
			"could_not_start_dev_server": "Non è stato possibile avviare il server di sviluppo.",
			"delete_failed": "Eliminazione non riuscita: {{error}}",
			"detect_failed": "Rilevamento non riuscito: {{error}}",
			"dev_server_running": "Server di sviluppo in esecuzione su {{url}}.",
			"dev_server_stopped": "Server di sviluppo arrestato — anteprima da disco.",
			"failed": "Non riuscito: {{error}}",
			"follow_up_added": "Seguito {{label}} aggiunto alla Richiesta {{number}} — non ancora inviata.",
			"follow_up_failed": "Seguito non riuscito: {{error}}",
			"follow_up_origin_missing": "Non è stato possibile trovare il commento a cui dare seguito.",
			"looking_for_dev_server": "Ricerca di un server di sviluppo…",
			"no_dev_server_found": "Nessun server di sviluppo trovato per questa cartella — avvialo, oppure digita l'URL.",
			"opening_folder_picker": "Apertura del selettore di cartelle…",
			"picker_unavailable": "Selettore non disponibile ({{error}}) — digita invece il percorso.",
			"preview_refreshed": "Anteprima aggiornata — {{label}} completato",
			"previewing_from_disk": "Anteprima di {{name}} da disco.",
			"previewing_from_url": "Anteprima di {{name}} da {{url}}.",
			"remove_failed": "Rimozione non riuscita: {{error}}",
			"dispatch_failed_unconfirmed": "La richiesta {{number}} è stata sigillata, ma non è stato possibile confermare la consegna ({{error}}). Controllo della sessione: l'elenco si aggiornerà.",
			"sent_request_to_session": "Richiesta {{number}} ({{n}}) inviata → sessione {{label}}.",
			"no_session_for_request": "La richiesta {{number}} è pronta, ma questa app non ha una cartella, quindi non c'è nessuna sessione a cui inviarla. Imposta la cartella dell'app e poi inviala dall'elenco.",
			"servers_match_folder": "{{n}} server corrispondono a questa cartella ({{ports}}) — scegline uno.",
			"set_dev_server_for": "Server di sviluppo impostato per {{name}}.",
			"starting_command": "Avvio di {{command}}…",
			"starting_dev_server": "Avvio del server di sviluppo…",
			"stop_failed": "Arresto non riuscito: {{error}}",
			"unknown": "sconosciuto",
			"unknown_error": "errore sconosciuto",
			"using_running_dev_server": "Utilizzo del server di sviluppo già in esecuzione su {{url}}."
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "Seleziona visivamente gli elementi nell'anteprima live della tua app e trasformali in richieste di modifica mirate e collegate al codice sorgente per l'agente — come i commenti di Figma, ma per il codice.",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "Invio non riuscito",
			"send_failed_with_error": "Invio non riuscito: {{error}}",
			"accepted_body_unreadable": "Il server ha accettato la richiesta, ma la risposta non è stata leggibile.",
			"no_response_returned": "Nessuna risposta"
		}
	},
	ja: {
		comments: {
			"an_earlier_comment": "以前のコメント",
			"element_count": "{{n}} 個の要素",
			"follow_up_to": "↩ {{label}} への追記",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "クリックしてプレビューでこのコメントを開く",
			"remove_from_draft": "このコメントを下書きから削除"
		},
		devServer: {
			"detect_hint": "実行中の開発サーバーからこのプロジェクトをプレビュー(ホットリロードは維持されます)",
			"dev_server": "開発サーバー",
			"looking": "検索中…",
			"preview_from_disk_instead": "代わりにディスクからプレビュー",
			"url_placeholder": "http://localhost:5173",
			"use": "使用"
		},
		layout: { "drag_to_resize": "ドラッグしてサイズ変更" },
		modes: {
			"edit": "編集",
			"preview": "プレビュー"
		},
		page: {
			"tagline": "指し示し、説明すれば、コードが追いついてきます。",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "アプリのバックエンドが応答しませんでした。変更した直後であれば、Appsページで Design Tweak をオフにしてからオンにしてください。",
			"dev_server_not_reachable": "開発サーバーに到達できません",
			"dim_desktop": "デスクトップ",
			"dim_mobile": "モバイル",
			"dim_tablet": "タブレット",
			"dimensions": "画面サイズ",
			"fallback_name": "プレビュー",
			"frame_title": "アプリのプレビュー",
			"loading_name": "{{name}} を読み込み中…",
			"needs_dev_server_title": "これはWebアプリです — 開発サーバーが必要です",
			"no_dev_script_in_package_json": "package.json に dev スクリプトが見つかりません — 自分で起動してから、下の「開発サーバー」を押してください。",
			"no_html_entry": "ディスクから提供できるHTMLエントリポイントがないため、自身の開発サーバーでビルド・提供する必要があります。",
			"not_reachable": "プレビューに到達できません",
			"nothing_answered_at": "{{url}} からの応答がありません。このプロジェクトの開発サーバーを起動して再試行するか、URLをクリアしてディスクからファイルをプレビューしてください。",
			"refresh_preview": "プレビューを更新",
			"retry": "再試行",
			"runs_command_in_project": "{{name}} で {{command}} を実行",
			"start_dev_server": "開発サーバーを起動",
			"starting": "起動中…",
			"timed_out": "タイムアウトしました",
			"unbundled_entry": "エントリポイントは {{entry}} です — TypeScript/JSXのため、ブラウザーでは実行できません。提供時にビルドする必要があるため、ディスクからプレビューできるものはありません。"
		},
		projects: {
			"add": "追加",
			"browse_or_type_path": "フォルダーを参照するか、パスを入力してください",
			"click_again_to_disconnect": "もう一度クリックして接続を解除",
			"connect": "接続",
			"connected": "接続済み",
			"dev_badge": "dev",
			"load_new_app": "新しいアプリを読み込む",
			"loading": "読み込み中…",
			"loading_your_apps": "アプリを読み込み中…",
			"looking_for_connected_apps": "接続済みのアプリを検索中…",
			"needs_dev_server": "開発サーバーが必要です ({{command}})",
			"no_app_selected": "Webアプリが選択されていません。ドロップダウンから選んでください — 切り替えは即時に反映されます。",
			"no_dev_script": "dev スクリプトが見つかりません",
			"none_loaded": "まだWebアプリが読み込まれていません。",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "{{url}} からプレビュー中",
			"remove_from_list": "リストから削除",
			"select_app": "Webアプリを選択…"
		},
		requests: {
			"archive_to_history": "履歴にアーカイブ",
			"chip_done": "{{n}} 件完了",
			"chip_in_progress": "{{n}} 件進行中",
			"chip_not_sent": "{{n}} 件未送信",
			"chip_queued": "{{n}} 件キュー待ち",
			"delete_confirm": "リクエスト {{number}} を削除しますか？コメントは完全に削除され、元に戻せません。",
			"delete_request": "リクエストを削除",
			"empty_for_app": "{{name}} 向けの編集リクエストはまだありません。プレビューを編集モードに切り替え、要素を右クリックして変更内容を記述してください。コメントはバッチとして送信するリクエストに集約されます。",
			"empty_no_app": "Webアプリが接続されていません。上のドロップダウンから選んでください — 各アプリは独自のリクエスト、履歴、チャットセッションを保持します。",
			"history": "履歴",
			"more_actions": "リクエスト {{number}} のその他の操作",
			"no_comments": "コメントはまだありません。",
			"open_in_chat": "チャットで開く",
			"request_number": "リクエスト {{number}}",
			"sending": "送信中…",
			"send_request": "リクエスト {{number}} として送信",
			"send_missing_request": "リクエスト {{number}} を送信",
			"this_app": "このアプリ"
		},
		status: {
			"add_failed": "追加に失敗しました: {{error}}",
			"added_comment": "{{label}} を追加しました — リクエスト {{number}} 内 {{n}} 件、まだ未送信です。",
			"added_dev_previewing": "{{name}} (開発サーバー)を追加しました — プレビュー中です。",
			"added_found_dev_server": "{{name}} を追加しました — 開発サーバーが {{url}} に見つかりました。",
			"added_many_dev_servers": "{{name}} を追加しました — このフォルダーに一致する開発サーバーが {{n}} 件あるため、自動選択されませんでした。ドロップダウンから設定してください。",
			"added_previewing": "{{name}} を追加しました — プレビュー中です。",
			"already_registered": "すでに登録済みです — {{name}} に切り替えました。",
			"already_sent": "リクエスト {{number}} はすでに送信済みです。",
			"archive_failed": "アーカイブに失敗しました: {{error}}",
			"capture_failed": "キャプチャに失敗しました: {{error}}",
			"could_not_start_dev_server": "開発サーバーを起動できませんでした。",
			"delete_failed": "削除に失敗しました: {{error}}",
			"detect_failed": "検出に失敗しました: {{error}}",
			"dev_server_running": "開発サーバーが {{url}} で実行中です。",
			"dev_server_stopped": "開発サーバーが停止しました — ディスクからプレビュー中です。",
			"failed": "失敗しました: {{error}}",
			"follow_up_added": "追記 {{label}} をリクエスト {{number}} に追加しました — まだ未送信です。",
			"follow_up_failed": "追記に失敗しました: {{error}}",
			"follow_up_origin_missing": "追記対象のコメントが見つかりませんでした。",
			"looking_for_dev_server": "開発サーバーを検索中…",
			"no_dev_server_found": "このフォルダーの開発サーバーが見つかりません — 起動するか、URLを入力してください。",
			"opening_folder_picker": "フォルダー選択画面を開いています…",
			"picker_unavailable": "選択画面が利用できません ({{error}}) — 代わりにパスを入力してください。",
			"preview_refreshed": "プレビューを更新しました — {{label}} 完了",
			"previewing_from_disk": "{{name}} をディスクからプレビュー中です。",
			"previewing_from_url": "{{name}} を {{url}} からプレビュー中です。",
			"remove_failed": "削除に失敗しました: {{error}}",
			"dispatch_failed_unconfirmed": "リクエスト {{number}} は確定しましたが、配信を確認できませんでした ({{error}})。セッションを確認しています — リストは更新されます。",
			"sent_request_to_session": "リクエスト {{number}} ({{n}}) を {{label}} セッションに送信しました。",
			"no_session_for_request": "リクエスト {{number}} は準備できていますが、このアプリにフォルダーが設定されていないため、送信先のセッションがありません。アプリのフォルダーを設定してから、リストから送信してください。",
			"servers_match_folder": "このフォルダーに一致するサーバーが {{n}} 件あります ({{ports}}) — 1つ選んでください。",
			"set_dev_server_for": "{{name}} の開発サーバーを設定。",
			"starting_command": "{{command}} を起動中…",
			"starting_dev_server": "開発サーバーを起動中…",
			"stop_failed": "停止に失敗しました: {{error}}",
			"unknown": "不明",
			"unknown_error": "不明なエラー",
			"using_running_dev_server": "{{url}} で実行中の開発サーバーを使用しています。"
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "アプリのライブプレビューで要素をビジュアルに選択し、エージェント向けのスコープ付きソースマップ編集リクエストに変換します — Figmaのコメントのような感覚で、コードに対して行えます。",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "送信に失敗しました",
			"send_failed_with_error": "送信に失敗しました: {{error}}",
			"accepted_body_unreadable": "サーバーはリクエストを受け付けましたが、応答を読み取れませんでした。",
			"no_response_returned": "応答がありませんでした"
		}
	},
	ko: {
		comments: {
			"an_earlier_comment": "이전 댓글",
			"element_count": "요소 {{n}}개",
			"follow_up_to": "↩ {{label}}에 대한 후속 댓글",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "클릭하여 미리보기에서 이 댓글 열기",
			"remove_from_draft": "이 댓글을 초안에서 제거"
		},
		devServer: {
			"detect_hint": "실행 중인 개발 서버에서 이 프로젝트 미리보기(핫 리로드 유지)",
			"dev_server": "개발 서버",
			"looking": "찾는 중…",
			"preview_from_disk_instead": "대신 디스크에서 미리보기",
			"url_placeholder": "http://localhost:5173",
			"use": "사용"
		},
		layout: { "drag_to_resize": "드래그하여 크기 조절" },
		modes: {
			"edit": "편집",
			"preview": "미리보기"
		},
		page: {
			"tagline": "가리키고, 설명하면, 코드가 따라옵니다.",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "앱 백엔드가 응답하지 않았습니다. 방금 변경했다면 Apps 페이지에서 Design Tweak을 껐다가 다시 켜보세요.",
			"dev_server_not_reachable": "개발 서버에 연결할 수 없습니다",
			"dim_desktop": "데스크톱",
			"dim_mobile": "모바일",
			"dim_tablet": "태블릿",
			"dimensions": "화면 크기",
			"fallback_name": "미리보기",
			"frame_title": "앱 미리보기",
			"loading_name": "{{name}} 불러오는 중…",
			"needs_dev_server_title": "이것은 웹 앱입니다 — 개발 서버가 필요합니다",
			"no_dev_script_in_package_json": "package.json에서 dev 스크립트를 찾을 수 없습니다 — 직접 실행한 후 아래 개발 서버를 눌러주세요.",
			"no_html_entry": "디스크에서 제공할 HTML 진입점이 없어, 자체 개발 서버로 빌드하고 제공해야 합니다.",
			"not_reachable": "미리보기에 연결할 수 없습니다",
			"nothing_answered_at": "{{url}}에서 응답이 없습니다. 이 프로젝트의 개발 서버를 시작한 후 다시 시도하거나, URL을 지우고 디스크에서 파일을 미리보세요.",
			"refresh_preview": "미리보기 새로고침",
			"retry": "재시도",
			"runs_command_in_project": "{{name}}에서 {{command}} 실행",
			"start_dev_server": "개발 서버 시작",
			"starting": "시작 중…",
			"timed_out": "시간 초과됨",
			"unbundled_entry": "진입점이 {{entry}}입니다 — TypeScript/JSX라 브라우저에서 실행할 수 없습니다. 제공 시 빌드해야 하므로 디스크에서 미리볼 수 있는 것이 없습니다."
		},
		projects: {
			"add": "추가",
			"browse_or_type_path": "폴더를 찾아보거나 경로를 입력하세요",
			"click_again_to_disconnect": "다시 클릭하여 연결 해제",
			"connect": "연결",
			"connected": "연결됨",
			"dev_badge": "dev",
			"load_new_app": "새 앱 불러오기",
			"loading": "불러오는 중…",
			"loading_your_apps": "앱을 불러오는 중…",
			"looking_for_connected_apps": "연결된 앱을 찾는 중…",
			"needs_dev_server": "개발 서버가 필요합니다 ({{command}})",
			"no_app_selected": "선택된 웹 앱이 없습니다. 드롭다운에서 선택하세요 — 즉시 전환됩니다.",
			"no_dev_script": "dev 스크립트를 찾을 수 없음",
			"none_loaded": "아직 불러온 웹 앱이 없습니다.",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "{{url}}에서 미리보는 중",
			"remove_from_list": "목록에서 제거",
			"select_app": "웹 앱 선택…"
		},
		requests: {
			"archive_to_history": "기록으로 보관",
			"chip_done": "{{n}}개 완료",
			"chip_in_progress": "{{n}}개 진행 중",
			"chip_not_sent": "{{n}}개 미전송",
			"chip_queued": "{{n}}개 대기 중",
			"delete_confirm": "요청 {{number}}을(를) 삭제하시겠습니까? 댓글이 영구적으로 제거되며 되돌릴 수 없습니다.",
			"delete_request": "요청 삭제",
			"empty_for_app": "{{name}}에 대한 편집 요청이 아직 없습니다. 미리보기를 편집 모드로 전환하고 요소를 우클릭하여 변경 사항을 설명하세요. 댓글은 일괄 전송할 요청으로 모입니다.",
			"empty_no_app": "연결된 웹 앱이 없습니다. 위 드롭다운에서 선택하세요 — 각 앱은 자체 요청, 기록, 채팅 세션을 유지합니다.",
			"history": "기록",
			"more_actions": "요청 {{number}}에 대한 추가 작업",
			"no_comments": "아직 댓글이 없습니다.",
			"open_in_chat": "채팅에서 열기",
			"request_number": "요청 {{number}}",
			"sending": "전송 중…",
			"send_request": "요청 {{number}}(으)로 전송",
			"send_missing_request": "요청 {{number}} 전송",
			"this_app": "이 앱"
		},
		status: {
			"add_failed": "추가 실패: {{error}}",
			"added_comment": "{{label}} 추가됨 — 요청 {{number}}에 {{n}}개, 아직 전송되지 않음.",
			"added_dev_previewing": "{{name}} (개발 서버) 추가됨 — 미리보는 중.",
			"added_found_dev_server": "{{name}} 추가됨 — 개발 서버를 {{url}}에서 찾았습니다.",
			"added_many_dev_servers": "{{name}} 추가됨 — 이 폴더와 일치하는 개발 서버가 {{n}}개라 자동으로 선택하지 않았습니다. 드롭다운에서 설정하세요.",
			"added_previewing": "{{name}} 추가됨 — 미리보는 중.",
			"already_registered": "이미 등록됨 — {{name}}(으)로 전환했습니다.",
			"already_sent": "요청 {{number}}은(는) 이미 전송되었습니다.",
			"archive_failed": "보관 실패: {{error}}",
			"capture_failed": "캡처 실패: {{error}}",
			"could_not_start_dev_server": "개발 서버를 시작할 수 없습니다.",
			"delete_failed": "삭제 실패: {{error}}",
			"detect_failed": "감지 실패: {{error}}",
			"dev_server_running": "개발 서버가 {{url}}에서 실행 중입니다.",
			"dev_server_stopped": "개발 서버가 중지됨 — 디스크에서 미리보는 중.",
			"failed": "실패: {{error}}",
			"follow_up_added": "후속 {{label}}이(가) 요청 {{number}}에 추가됨 — 아직 전송되지 않음.",
			"follow_up_failed": "후속 조치 실패: {{error}}",
			"follow_up_origin_missing": "후속할 댓글을 찾을 수 없습니다.",
			"looking_for_dev_server": "개발 서버를 찾는 중…",
			"no_dev_server_found": "이 폴더에 대한 개발 서버를 찾을 수 없습니다 — 시작하거나 URL을 입력하세요.",
			"opening_folder_picker": "폴더 선택기를 여는 중…",
			"picker_unavailable": "선택기를 사용할 수 없습니다 ({{error}}) — 대신 경로를 입력하세요.",
			"preview_refreshed": "미리보기 새로고침됨 — {{label}} 완료",
			"previewing_from_disk": "{{name}}을(를) 디스크에서 미리보는 중입니다.",
			"previewing_from_url": "{{name}}을(를) {{url}}에서 미리보는 중입니다.",
			"remove_failed": "제거 실패: {{error}}",
			"dispatch_failed_unconfirmed": "요청 {{number}}은(는) 확정되었지만 전달을 확인할 수 없습니다 ({{error}}). 세션을 확인하는 중입니다 — 목록이 업데이트됩니다.",
			"sent_request_to_session": "요청 {{number}} ({{n}})을 {{label}} 세션으로 전송했습니다.",
			"no_session_for_request": "요청 {{number}}은(는) 준비되었지만 이 앱에 폴더가 설정되지 않아 보낼 세션이 없습니다. 앱의 폴더를 설정한 후 목록에서 전송하세요.",
			"servers_match_folder": "이 폴더와 일치하는 서버가 {{n}}개 있습니다 ({{ports}}) — 하나를 선택하세요.",
			"set_dev_server_for": "{{name}}의 개발 서버 설정.",
			"starting_command": "{{command}} 시작 중…",
			"starting_dev_server": "개발 서버를 시작하는 중…",
			"stop_failed": "중지 실패: {{error}}",
			"unknown": "알 수 없음",
			"unknown_error": "알 수 없는 오류",
			"using_running_dev_server": "{{url}}에서 이미 실행 중인 개발 서버를 사용합니다."
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "실행 중인 앱 미리보기에서 요소를 시각적으로 선택하여, 에이전트를 위한 범위가 지정된 소스맵 편집 요청으로 변환합니다 — 코드에 대한 Figma 댓글과 같은 방식입니다.",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "전송 실패",
			"send_failed_with_error": "전송 실패: {{error}}",
			"accepted_body_unreadable": "서버가 요청을 수락했지만 응답을 읽을 수 없었습니다.",
			"no_response_returned": "응답이 없습니다"
		}
	},
	pt: {
		comments: {
			"an_earlier_comment": "um comentário anterior",
			"element_count": "{{n}} elementos",
			"follow_up_to": "↩ resposta a {{label}}",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "Clique para abrir este comentário na prévia",
			"remove_from_draft": "Remover este comentário do rascunho"
		},
		devServer: {
			"detect_hint": "Visualize este projeto a partir do dev server em execução (mantém o hot reload funcionando)",
			"dev_server": "Dev server",
			"looking": "Procurando…",
			"preview_from_disk_instead": "Visualizar do disco em vez disso",
			"url_placeholder": "http://localhost:5173",
			"use": "Usar"
		},
		layout: { "drag_to_resize": "Arraste para redimensionar" },
		modes: {
			"edit": "Editar",
			"preview": "Visualizar"
		},
		page: {
			"tagline": "Aponte, descreva e veja o código acompanhar.",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "O backend do app não respondeu. Se você acabou de alterá-lo, desative e ative o Design Tweak na página Apps.",
			"dev_server_not_reachable": "Dev server inacessível",
			"dim_desktop": "Desktop",
			"dim_mobile": "Móvel",
			"dim_tablet": "Tablet",
			"dimensions": "Dimensões",
			"fallback_name": "prévia",
			"frame_title": "Pré-visualização da app",
			"loading_name": "Carregando {{name}}…",
			"needs_dev_server_title": "Este é um app web — ele precisa de um dev server",
			"no_dev_script_in_package_json": "Nenhum script dev encontrado no package.json — inicie-o você mesmo e depois clique em Dev server abaixo.",
			"no_html_entry": "Não há um ponto de entrada HTML para servir do disco, então ele precisa ser compilado e servido pelo próprio dev server.",
			"not_reachable": "Prévia inacessível",
			"nothing_answered_at": "Nada respondeu em {{url}}. Inicie o dev server deste projeto e tente novamente — ou limpe a URL dele para visualizar os arquivos do disco.",
			"refresh_preview": "Atualizar prévia",
			"retry": "Tentar novamente",
			"runs_command_in_project": "Executa {{command}} em {{name}}",
			"start_dev_server": "Iniciar o dev server",
			"starting": "Iniciando…",
			"timed_out": "tempo esgotado",
			"unbundled_entry": "O ponto de entrada dele é {{entry}} — TypeScript/JSX, que o navegador não consegue executar. Os arquivos precisam ser compilados no momento em que são servidos, então não há nada para visualizar do disco."
		},
		projects: {
			"add": "Adicionar",
			"browse_or_type_path": "Procure uma pasta ou digite o caminho dela",
			"click_again_to_disconnect": "Clique novamente para desconectar",
			"connect": "Conectar",
			"connected": "Conectado",
			"dev_badge": "dev",
			"load_new_app": "Carregar novo app",
			"loading": "Carregando…",
			"loading_your_apps": "Carregando seus apps…",
			"looking_for_connected_apps": "Procurando seus apps conectados…",
			"needs_dev_server": "Precisa de um dev server ({{command}})",
			"no_app_selected": "Nenhum app web selecionado. Escolha um no menu suspenso — a troca é instantânea.",
			"no_dev_script": "nenhum script dev encontrado",
			"none_loaded": "Nenhum app web carregado ainda.",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "Visualizando de {{url}}",
			"remove_from_list": "Remover da lista",
			"select_app": "Selecione um app web…"
		},
		requests: {
			"archive_to_history": "Arquivar no Histórico",
			"chip_done": "{{n}} concluídos",
			"chip_in_progress": "{{n}} em andamento",
			"chip_not_sent": "{{n}} não enviados",
			"chip_queued": "{{n}} na fila",
			"delete_confirm": "Excluir a solicitação {{number}}? Seus comentários são removidos permanentemente — não é possível desfazer.",
			"delete_request": "Excluir solicitação",
			"empty_for_app": "Ainda não há solicitações de edição para {{name}}. Mude a prévia para o modo Editar, clique com o botão direito em um elemento e descreva a mudança. Os comentários se juntam em uma solicitação que você envia em lote.",
			"empty_no_app": "Nenhum app web conectado. Escolha um no menu suspenso acima — cada app mantém suas próprias solicitações, histórico e sessão de chat.",
			"history": "Histórico",
			"more_actions": "Mais ações para a solicitação {{number}}",
			"no_comments": "Nenhum comentário ainda.",
			"open_in_chat": "Abrir no chat",
			"request_number": "Solicitação {{number}}",
			"sending": "Enviando…",
			"send_request": "Enviar como Solicitação {{number}}",
			"send_missing_request": "Enviar Solicitação {{number}}",
			"this_app": "este app"
		},
		status: {
			"add_failed": "Falha ao adicionar: {{error}}",
			"added_comment": "{{label}} adicionado — {{n}} na Solicitação {{number}}, ainda não enviada.",
			"added_dev_previewing": "{{name}} adicionado (dev server) — visualizando.",
			"added_found_dev_server": "{{name}} adicionado — dev server encontrado em {{url}}.",
			"added_many_dev_servers": "{{name}} adicionado — {{n}} dev servers correspondem a esta pasta, então nenhum foi assumido. Defina um no menu suspenso.",
			"added_previewing": "{{name}} adicionado — visualizando.",
			"already_registered": "Já estava registrado — alternado para {{name}}.",
			"already_sent": "A solicitação {{number}} já foi enviada.",
			"archive_failed": "Falha ao arquivar: {{error}}",
			"capture_failed": "Falha na captura: {{error}}",
			"could_not_start_dev_server": "Não foi possível iniciar o dev server.",
			"delete_failed": "Falha ao excluir: {{error}}",
			"detect_failed": "Falha na detecção: {{error}}",
			"dev_server_running": "Dev server em execução em {{url}}.",
			"dev_server_stopped": "Dev server parado — visualizando do disco.",
			"failed": "Falhou: {{error}}",
			"follow_up_added": "Resposta {{label}} adicionada à Solicitação {{number}} — ainda não enviada.",
			"follow_up_failed": "Falha na resposta: {{error}}",
			"follow_up_origin_missing": "Não foi possível encontrar esse comentário para responder.",
			"looking_for_dev_server": "Procurando um dev server…",
			"no_dev_server_found": "Nenhum dev server encontrado para esta pasta — inicie-o ou digite a URL.",
			"opening_folder_picker": "Abrindo o seletor de pastas…",
			"picker_unavailable": "Seletor indisponível ({{error}}) — digite o caminho em vez disso.",
			"preview_refreshed": "Prévia atualizada — {{label}} concluído",
			"previewing_from_disk": "Visualizando {{name}} do disco.",
			"previewing_from_url": "Visualizando {{name}} de {{url}}.",
			"remove_failed": "Falha ao remover: {{error}}",
			"dispatch_failed_unconfirmed": "A solicitação {{number}} foi selada, mas não foi possível confirmar a entrega ({{error}}). Verificando a sessão — a lista será atualizada.",
			"sent_request_to_session": "Solicitação {{number}} ({{n}}) enviada → sessão {{label}}.",
			"no_session_for_request": "A solicitação {{number}} está pronta, mas este aplicativo não tem pasta, então não há sessão para enviá-la. Defina a pasta do aplicativo e envie pela lista.",
			"servers_match_folder": "{{n}} servidores correspondem a esta pasta ({{ports}}) — escolha um.",
			"set_dev_server_for": "Dev server definido para {{name}}.",
			"starting_command": "Iniciando {{command}}…",
			"starting_dev_server": "Iniciando o dev server…",
			"stop_failed": "Falha ao parar: {{error}}",
			"unknown": "desconhecido",
			"unknown_error": "erro desconhecido",
			"using_running_dev_server": "Usando o dev server já em execução em {{url}}."
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "Selecione visualmente elementos na pré-visualização em tempo real do seu app e transforme-os em solicitações de edição delimitadas e vinculadas ao código-fonte para o agente — como comentários do Figma, mas para código.",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "Falha no envio",
			"send_failed_with_error": "Falha ao enviar: {{error}}",
			"accepted_body_unreadable": "O servidor aceitou a solicitação, mas a resposta não pôde ser lida.",
			"no_response_returned": "Sem resposta"
		}
	},
	ru: {
		comments: {
			"an_earlier_comment": "более ранний комментарий",
			"element_count": "элементов: {{n}}",
			"follow_up_to": "↩ дополнение к {{label}}",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "Нажмите, чтобы открыть этот комментарий в предпросмотре",
			"remove_from_draft": "Удалить этот комментарий из черновика"
		},
		devServer: {
			"detect_hint": "Показать этот проект с его запущенного dev-сервера (горячая перезагрузка продолжит работать)",
			"dev_server": "Dev-сервер",
			"looking": "Поиск…",
			"preview_from_disk_instead": "Вместо этого показать с диска",
			"url_placeholder": "http://localhost:5173",
			"use": "Использовать"
		},
		layout: { "drag_to_resize": "Потяните, чтобы изменить размер" },
		modes: {
			"edit": "Правка",
			"preview": "Предпросмотр"
		},
		page: {
			"tagline": "Укажите, опишите — и код подтянется сам.",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "Бэкенд приложения не ответил. Если вы только что его изменили, выключите и снова включите Design Tweak на странице «Приложения».",
			"dev_server_not_reachable": "Dev-сервер недоступен",
			"dim_desktop": "Компьютер",
			"dim_mobile": "Телефон",
			"dim_tablet": "Планшет",
			"dimensions": "Размеры",
			"fallback_name": "предпросмотр",
			"frame_title": "Предпросмотр приложения",
			"loading_name": "Загрузка {{name}}…",
			"needs_dev_server_title": "Это веб-приложение — ему нужен dev-сервер",
			"no_dev_script_in_package_json": "В package.json не найден скрипт dev — запустите сервер сами, затем нажмите «Dev-сервер» ниже.",
			"no_html_entry": "Нет HTML-точки входа, которую можно раздавать с диска, поэтому приложение должно собираться и раздаваться собственным dev-сервером.",
			"not_reachable": "Предпросмотр недоступен",
			"nothing_answered_at": "По адресу {{url}} никто не ответил. Запустите dev-сервер этого проекта и повторите — или очистите его URL, чтобы показать файлы с диска.",
			"refresh_preview": "Обновить предпросмотр",
			"retry": "Повторить",
			"runs_command_in_project": "Выполняет {{command}} в {{name}}",
			"start_dev_server": "Запустить dev-сервер",
			"starting": "Запуск…",
			"timed_out": "истекло время ожидания",
			"unbundled_entry": "Его точка входа — {{entry}}, то есть TypeScript/JSX, который браузер выполнить не может. Файлы нужно собирать во время раздачи, поэтому показывать с диска нечего."
		},
		projects: {
			"add": "Добавить",
			"browse_or_type_path": "Выберите папку или введите её путь",
			"click_again_to_disconnect": "Нажмите ещё раз, чтобы отключить",
			"connect": "Подключить",
			"connected": "Подключено",
			"dev_badge": "dev",
			"load_new_app": "Загрузить новое приложение",
			"loading": "Загрузка…",
			"loading_your_apps": "Загрузка ваших приложений…",
			"looking_for_connected_apps": "Поиск подключённых приложений…",
			"needs_dev_server": "Нужен dev-сервер ({{command}})",
			"no_app_selected": "Веб-приложение не выбрано. Выберите его в списке — переключение мгновенное.",
			"no_dev_script": "скрипт dev не найден",
			"none_loaded": "Веб-приложения ещё не загружены.",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "Предпросмотр из {{url}}",
			"remove_from_list": "Убрать из списка",
			"select_app": "Выберите веб-приложение…"
		},
		requests: {
			"archive_to_history": "Архивировать в историю",
			"chip_done": "готово: {{n}}",
			"chip_in_progress": "в работе: {{n}}",
			"chip_not_sent": "не отправлено: {{n}}",
			"chip_queued": "в очереди: {{n}}",
			"delete_confirm": "Удалить запрос {{number}}? Его комментарии будут удалены безвозвратно — отменить это действие нельзя.",
			"delete_request": "Удалить запрос",
			"empty_for_app": "Для {{name}} пока нет запросов на правки. Переключите предпросмотр в режим «Правка», нажмите на элемент правой кнопкой и опишите изменение. Комментарии собираются в запрос, который отправляется пакетом.",
			"empty_no_app": "Веб-приложение не подключено. Выберите его в списке выше — у каждого приложения свои запросы, история и сессия чата.",
			"history": "История",
			"more_actions": "Другие действия для запроса {{number}}",
			"no_comments": "Комментариев пока нет.",
			"open_in_chat": "Открыть в чате",
			"request_number": "Запрос {{number}}",
			"sending": "Отправка…",
			"send_request": "Отправить как запрос {{number}}",
			"send_missing_request": "Отправить запрос {{number}}",
			"this_app": "это приложение"
		},
		status: {
			"add_failed": "Не удалось добавить: {{error}}",
			"added_comment": "{{label}} добавлен — в запросе {{number}}: {{n}}, пока не отправлен.",
			"added_dev_previewing": "Добавлено: {{name}} (dev-сервер) — показываю предпросмотр.",
			"added_found_dev_server": "Добавлено: {{name}} — его dev-сервер найден по адресу {{url}}.",
			"added_many_dev_servers": "Добавлено: {{name}} — этой папке соответствует dev-серверов: {{n}}, поэтому ни один не выбран автоматически. Укажите нужный в списке.",
			"added_previewing": "Добавлено: {{name}} — показываю предпросмотр.",
			"already_registered": "Уже зарегистрировано — переключено на {{name}}.",
			"already_sent": "Запрос {{number}} уже отправлен.",
			"archive_failed": "Не удалось архивировать: {{error}}",
			"capture_failed": "Не удалось выполнить захват: {{error}}",
			"could_not_start_dev_server": "Не удалось запустить dev-сервер.",
			"delete_failed": "Не удалось удалить: {{error}}",
			"detect_failed": "Не удалось определить: {{error}}",
			"dev_server_running": "Dev-сервер работает по адресу {{url}}.",
			"dev_server_stopped": "Dev-сервер остановлен — предпросмотр с диска.",
			"failed": "Ошибка: {{error}}",
			"follow_up_added": "Дополнение {{label}} добавлено в запрос {{number}} — ещё не отправлено.",
			"follow_up_failed": "Не удалось добавить дополнение: {{error}}",
			"follow_up_origin_missing": "Не удалось найти комментарий, к которому нужно дополнение.",
			"looking_for_dev_server": "Поиск dev-сервера…",
			"no_dev_server_found": "Для этой папки dev-сервер не найден — запустите его или введите URL.",
			"opening_folder_picker": "Открываю выбор папки…",
			"picker_unavailable": "Выбор папки недоступен ({{error}}) — введите путь вручную.",
			"preview_refreshed": "Предпросмотр обновлён — {{label}}: готово",
			"previewing_from_disk": "Предпросмотр {{name}} с диска.",
			"previewing_from_url": "Предпросмотр {{name}} из {{url}}.",
			"remove_failed": "Не удалось убрать из списка: {{error}}",
			"dispatch_failed_unconfirmed": "Запрос {{number}} закрыт, но подтвердить доставку не удалось ({{error}}). Проверяем сессию — список обновится.",
			"sent_request_to_session": "Запрос {{number}} ({{n}}) отправлен → сессия {{label}}.",
			"no_session_for_request": "Запрос {{number}} готов, но у этого приложения нет папки, поэтому отправлять его некуда. Укажите папку приложения, затем отправьте запрос из списка.",
			"servers_match_folder": "Этой папке соответствует серверов: {{n}} ({{ports}}) — выберите один.",
			"set_dev_server_for": "Dev-сервер задан для {{name}}.",
			"starting_command": "Запуск {{command}}…",
			"starting_dev_server": "Запуск dev-сервера…",
			"stop_failed": "Не удалось остановить: {{error}}",
			"unknown": "неизвестно",
			"unknown_error": "неизвестная ошибка",
			"using_running_dev_server": "Использую dev-сервер, уже работающий по адресу {{url}}."
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "Визуально выбирайте элементы в живом предпросмотре вашего приложения и превращайте их в целевые запросы на изменение с привязкой к исходному коду для агента — как комментарии в Figma, но для кода.",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "Не удалось отправить",
			"send_failed_with_error": "Не удалось отправить: {{error}}",
			"accepted_body_unreadable": "Сервер принял запрос, но ответ не удалось прочитать.",
			"no_response_returned": "Ответ не получен"
		}
	},
	"zh-CN": {
		comments: {
			"an_earlier_comment": "较早的一条评论",
			"element_count": "{{n}} 个元素",
			"follow_up_to": "↩ 针对 {{label}} 的追加评论",
			"meta": "{{label}} · {{element}} · {{ago}}",
			"open_in_preview": "点击在预览中打开此评论",
			"remove_from_draft": "从草稿中移除此评论"
		},
		devServer: {
			"detect_hint": "从该项目正在运行的开发服务器预览（可保持热重载）",
			"dev_server": "开发服务器",
			"looking": "正在查找…",
			"preview_from_disk_instead": "改为从磁盘预览",
			"url_placeholder": "http://localhost:5173",
			"use": "使用"
		},
		layout: { "drag_to_resize": "拖动以调整大小" },
		modes: {
			"edit": "编辑",
			"preview": "预览"
		},
		page: {
			"tagline": "指一指、说一说，代码随之跟上。",
			"title": "Design Tweak"
		},
		preview: {
			"backend_did_not_answer": "应用后端未响应。如果你刚刚修改过它，请在“应用”页面将 Design Tweak 关闭再重新开启。",
			"dev_server_not_reachable": "无法连接开发服务器",
			"dim_desktop": "桌面",
			"dim_mobile": "手机",
			"dim_tablet": "平板",
			"dimensions": "尺寸",
			"fallback_name": "预览",
			"frame_title": "应用预览",
			"loading_name": "正在加载 {{name}}…",
			"needs_dev_server_title": "这是一个 Web 应用 — 需要开发服务器",
			"no_dev_script_in_package_json": "package.json 中未找到 dev 脚本 — 请自行启动，然后点击下方的“开发服务器”。",
			"no_html_entry": "没有可从磁盘直接提供的 HTML 入口，因此必须由它自己的开发服务器构建并提供服务。",
			"not_reachable": "无法连接预览",
			"nothing_answered_at": "{{url}} 没有任何响应。请启动该项目的开发服务器后重试 — 或清除其 URL，改为从磁盘预览文件。",
			"refresh_preview": "刷新预览",
			"retry": "重试",
			"runs_command_in_project": "在 {{name}} 中运行 {{command}}",
			"start_dev_server": "启动开发服务器",
			"starting": "正在启动…",
			"timed_out": "超时",
			"unbundled_entry": "它的入口是 {{entry}} — TypeScript/JSX，浏览器无法直接运行。这些文件需要在提供服务时构建，因此无法从磁盘预览。"
		},
		projects: {
			"add": "添加",
			"browse_or_type_path": "浏览选择文件夹，或输入其路径",
			"click_again_to_disconnect": "再次点击以断开连接",
			"connect": "连接",
			"connected": "已连接",
			"dev_badge": "dev",
			"load_new_app": "加载新应用",
			"loading": "正在加载…",
			"loading_your_apps": "正在加载你的应用…",
			"looking_for_connected_apps": "正在查找你已连接的应用…",
			"needs_dev_server": "需要开发服务器（{{command}}）",
			"no_app_selected": "未选择 Web 应用。请在下拉菜单中选择一个 — 切换是即时的。",
			"no_dev_script": "未找到 dev 脚本",
			"none_loaded": "尚未加载任何 Web 应用。",
			"path_placeholder": "/path/to/your/app",
			"previewing_from": "正在从 {{url}} 预览",
			"remove_from_list": "从列表中移除",
			"select_app": "选择 Web 应用…"
		},
		requests: {
			"archive_to_history": "归档到历史",
			"chip_done": "{{n}} 项已完成",
			"chip_in_progress": "{{n}} 项进行中",
			"chip_not_sent": "{{n}} 项未发送",
			"chip_queued": "{{n}} 项已排队",
			"delete_confirm": "删除请求 {{number}}？其评论将被永久删除，此操作无法撤销。",
			"delete_request": "删除请求",
			"empty_for_app": "{{name}} 还没有任何修改请求。将预览切换到编辑模式，右键点击某个元素，然后描述你想要的改动。评论会汇集成一个请求，供你批量发送。",
			"empty_no_app": "尚未连接 Web 应用。请在上方下拉菜单中选择一个 — 每个应用都有各自的请求、历史和聊天会话。",
			"history": "历史",
			"more_actions": "请求 {{number}} 的更多操作",
			"no_comments": "暂无评论。",
			"open_in_chat": "在聊天中打开",
			"request_number": "请求 {{number}}",
			"sending": "正在发送…",
			"send_request": "作为请求 {{number}} 发送",
			"send_missing_request": "发送请求 {{number}}",
			"this_app": "此应用"
		},
		status: {
			"add_failed": "添加失败：{{error}}",
			"added_comment": "已添加 {{label}} — 请求 {{number}} 中现有 {{n}}，尚未发送。",
			"added_dev_previewing": "已添加 {{name}}（开发服务器）— 正在预览。",
			"added_found_dev_server": "已添加 {{name}} — 在 {{url}} 找到了它的开发服务器。",
			"added_many_dev_servers": "已添加 {{name}} — 有 {{n}} 个开发服务器匹配此文件夹，因此未自动选定。请在下拉菜单中指定一个。",
			"added_previewing": "已添加 {{name}} — 正在预览。",
			"already_registered": "已注册过 — 已切换到 {{name}}。",
			"already_sent": "请求 {{number}} 已发送。",
			"archive_failed": "归档失败：{{error}}",
			"capture_failed": "捕获失败：{{error}}",
			"could_not_start_dev_server": "无法启动开发服务器。",
			"delete_failed": "删除失败：{{error}}",
			"detect_failed": "检测失败：{{error}}",
			"dev_server_running": "开发服务器正在 {{url}} 运行。",
			"dev_server_stopped": "开发服务器已停止 — 正在从磁盘预览。",
			"failed": "失败：{{error}}",
			"follow_up_added": "追加评论 {{label}} 已加入请求 {{number}} — 尚未发送。",
			"follow_up_failed": "追加失败：{{error}}",
			"follow_up_origin_missing": "找不到要追加的那条评论。",
			"looking_for_dev_server": "正在查找开发服务器…",
			"no_dev_server_found": "未找到此文件夹的开发服务器 — 请先启动它，或输入其 URL。",
			"opening_folder_picker": "正在打开文件夹选择器…",
			"picker_unavailable": "选择器不可用（{{error}}）— 请改为手动输入路径。",
			"preview_refreshed": "预览已刷新 — {{label}} 已完成",
			"previewing_from_disk": "正在从磁盘预览 {{name}}。",
			"previewing_from_url": "正在从 {{url}} 预览 {{name}}。",
			"remove_failed": "移除失败：{{error}}",
			"dispatch_failed_unconfirmed": "请求 {{number}} 已封存，但无法确认送达（{{error}}）。正在检查会话——列表将会更新。",
			"sent_request_to_session": "已发送请求 {{number}}（{{n}}）→ {{label}} 会话。",
			"no_session_for_request": "请求 {{number}} 已就绪，但此应用没有文件夹，因此没有可发送的会话。请先设置应用的文件夹，然后从列表中发送。",
			"servers_match_folder": "有 {{n}} 个服务器匹配此文件夹（{{ports}}）— 请选择一个。",
			"set_dev_server_for": "已为 {{name}} 设置开发服务器。",
			"starting_command": "正在启动 {{command}}…",
			"starting_dev_server": "正在启动开发服务器…",
			"stop_failed": "停止失败：{{error}}",
			"unknown": "未知",
			"unknown_error": "未知错误",
			"using_running_dev_server": "使用已在 {{url}} 运行的开发服务器。"
		},
		manifest: {
			"display_name": "Design Tweak",
			"description": "在应用的实时预览中直观地选取元素，并将其转化为限定范围、与源码映射的编辑请求供 Agent 处理 — 就像 Figma 评论，但用于代码。",
			"page_label": "Design Tweak"
		},
		common: {
			"send_failed": "发送失败",
			"send_failed_with_error": "发送失败：{{error}}",
			"accepted_body_unreadable": "服务器已接受请求，但无法读取其响应。",
			"no_response_returned": "未返回响应"
		}
	}
};
var own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function lookup(catalog, key) {
	let node = catalog;
	for (const part of key.split(".")) {
		if (node === void 0 || typeof node === "string" || !own(node, part)) return void 0;
		node = node[part];
	}
	return typeof node === "string" ? node : void 0;
}
/** The catalogs to try for `locale`, most specific first, always ending in English. */
function localeChain(locale) {
	const chain = [];
	const add = (candidate) => {
		if (own(CATALOGS, candidate) && !chain.includes(candidate)) chain.push(candidate);
	};
	add(locale);
	add(locale.split("-")[0]);
	add("en");
	return chain;
}
function currentLocale() {
	try {
		const locale = activeLocale();
		return typeof locale === "string" && locale ? locale : "en";
	} catch {
		return "en";
	}
}
var PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;
function t(key, vars) {
	for (const locale of localeChain(currentLocale())) {
		const text = lookup(CATALOGS[locale], key);
		if (text !== void 0) return text.replace(PLACEHOLDER, (whole, name) => vars && own(vars, name) ? String(vars[name]) : whole);
	}
	return key;
}
// src/timeAgo.ts
/** A timestamp this far ahead of us is clock skew, not the future. */
var SKEW_TOLERANCE_MS = 6e4;
/**
* Human-readable relative time from a unix timestamp (seconds). A missing or
* unparseable one reads `--`; a slightly-future one (a skewed clock) reads as
* now, because this only ever renders ages.
*/
function timeAgo(ts) {
	if (!ts || !Number.isFinite(ts) || ts < 1) return "--";
	const at = /* @__PURE__ */ new Date(ts * 1e3);
	if (Number.isNaN(at.getTime())) return "--";
	const now = Date.now();
	if (at.getTime() > now && at.getTime() - now < SKEW_TOLERANCE_MS) return fmtRelative(now, { now });
	return fmtRelative(at, { now });
}
// src/sendTurn.ts
/**
* The send-receipt contract this app needs from the dashboard's chat-core
* transport (`chat-core/transport/sendTurn.ts`), restated for a bundle: the
* dashboard module is not part of the App Kit, so the bundle cannot import it.
*
* One `POST /api/chat?ws=1` through a wire, bounded by `SEND_ABORT_MS`, and the
* answer read as a receipt. Never rejects; the caller branches on `status`:
*
* - `dispatched` / `queued`: the server took the message (`ok`, or `queued`).
* - `refused`: a non-2xx, a readable body with neither `ok` nor `queued`, or a
*   2xx an intermediary answered (a redirect that left `/api/chat` with a body
*   that is not JSON). Nothing was sent. `reason` is the server's explanation.
* - `unknown`: a 2xx whose body could not be read. The turn may well be running.
* - `response-late`: the deadline fired, or the wire said `indeterminate()`.
* - `transport-error`: the wire rejected with anything else.
*/
var SEND_ABORT_MS = 1e4;
var CHAT_ENDPOINT_PATH = "/api/chat";
function answeredByIntermediary(response) {
	if (!response.redirected) return false;
	try {
		return new URL(response.url ?? "", "http://localhost").pathname !== CHAT_ENDPOINT_PATH;
	} catch {
		return true;
	}
}
async function readSendReceipt(response) {
	let parsed;
	try {
		parsed = await response.json();
	} catch {
		parsed = void 0;
	}
	const readable = !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
	const body = readable ? parsed : {};
	if (!response.ok) return {
		body,
		outcome: "refused"
	};
	if (!readable) return {
		body,
		outcome: answeredByIntermediary(response) ? "refused" : "unknown"
	};
	if (body.ok || body.queued) return {
		body,
		outcome: "accepted"
	};
	return {
		body,
		outcome: "refused"
	};
}
async function sendTurn(opts) {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), SEND_ABORT_MS);
	try {
		const { body, outcome } = await readSendReceipt(await opts.wire({
			message: opts.message,
			slot: opts.slot
		}, controller.signal));
		if (outcome === "refused") return {
			status: "refused",
			body,
			reason: typeof body.error === "string" ? body.error : void 0
		};
		if (outcome === "unknown") return {
			status: controller.signal.aborted ? "response-late" : "unknown",
			body
		};
		return {
			status: body.ok && !body.queued ? "dispatched" : "queued",
			body
		};
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError") return {
			status: "response-late",
			body: {}
		};
		return {
			status: "transport-error",
			body: {}
		};
	} finally {
		clearTimeout(timeout);
	}
}
/** The `Error.name` a definitive server refusal carries (the dashboard transport's value). */
var SEND_REFUSED = "send-refused";
// src/api.ts
/** One request through the scoped client; a non-2xx is rethrown as `ApiError`
*  carrying the server's own sentence. */
async function hostFetch(path, init) {
	try {
		return await currentAppApi().raw(path, {
			credentials: "same-origin",
			...init
		});
	} catch (e) {
		throw toApiError(e);
	}
}
async function parse(r) {
	const text = await r.text();
	return text ? JSON.parse(text) : null;
}
async function get(path) {
	return parse(await hostFetch(path));
}
async function post(path, body) {
	return parse(await hostFetch(path, {
		method: "POST",
		headers: body !== void 0 ? { "Content-Type": "application/json" } : void 0,
		body: body !== void 0 ? JSON.stringify(body) : void 0
	}));
}
var API_BASE = "/apps/design-tweak/api";
/** `API_BASE` + path, with an optional query string built by `URLSearchParams`. */
function endpoint(path, params) {
	const query = params ? new URLSearchParams(params).toString() : "";
	return query ? API_BASE + path + "?" + query : API_BASE + path;
}
/** Cache-buster for the preview iframe: bumping it is the reload lever. */
function nonceQuery(nonce) {
	return new URLSearchParams({ _t: String(nonce) }).toString();
}
/**
* Where the preview iframe points for a project framed from one of the app's own
* loopback servers — its dev-server injecting proxy, or the static preview server.
* The backend resolves the ephemeral port live and hands it back as previewUrl, so
* this only has to append the nonce onto whatever query it already carries.
*/
function loopbackPreviewSrc(previewUrl, nonce) {
	return previewUrl + (previewUrl.includes("?") ? "&" : "?") + nonceQuery(nonce);
}
/**
* Path of a request's payload on disk — quoted to the agent, never fetched.
*
* `dataDir` MUST come from what the backend reports (`GET /health` → `dataDir`):
* the real location depends on `KIROCREW_APP_DATA_DIR` / `KIROCREW_HOME` and is
* not knowable from the client, and a hardcoded guess (this used to name the
* retired `~/.kirocrew/…` home) points the agent at a path that does not exist.
* Returns '' when the backend has not reported one, and callers then quote no
* path at all rather than a wrong one.
*
* Joined with '/' regardless of the host separator: `dataDir` is absolute, and a
* forward slash resolves on Windows too.
*/
function requestPayloadPath(dataDir, requestId) {
	if (!dataDir) return "";
	return dataDir.replace(/[\\/]+$/, "") + "/queue/" + requestId + ".json";
}
/** The per-comment progress endpoint the agent POSTs to (quoted in the prompt). */
function threadEndpoint(requestId, cidPlaceholder) {
	return endpoint("/thread", {
		id: requestId,
		cid: cidPlaceholder
	});
}
function fetchProjects() {
	return get(endpoint("/projects"));
}
/**
* Health probe. The only reason the page calls it: `dataDir` is where the backend
* ACTUALLY resolved its data home (env-dependent), which is what makes the
* payload path quoted to the agent correct instead of a guess.
*/
function fetchHealth() {
	return get(endpoint("/health"));
}
function fetchQueue() {
	return get(endpoint("/queue"));
}
function fetchHistory() {
	return get(endpoint("/history"));
}
function selectProject(id) {
	return post(endpoint("/projects/select"), { id });
}
function removeProject(id) {
	return post(endpoint("/projects/remove"), { id });
}
function addProject(path) {
	return post(endpoint("/projects"), { path });
}
function pickFolder() {
	return post(endpoint("/pick-folder"), {});
}
function submitComment(payload) {
	return post(endpoint("/submit"), payload);
}
function sendRequest(id) {
	return post(endpoint("/send", { id }), {});
}
/** Ack that a sealed request's prompt reached the agent. Idempotent server-side. */
function markDelivered(id) {
	return post(endpoint("/delivered", { id }), {});
}
function clearRequest(id) {
	return post(endpoint("/clear", { id }), {});
}
function deleteRequest(id) {
	return post(endpoint("/delete", { id }), {});
}
function deleteComment(id, cid) {
	return post(endpoint("/delete-comment", {
		id,
		cid
	}), {});
}
function setPreviewUrl(id, previewUrl) {
	return post(endpoint("/projects/preview-url"), {
		id,
		previewUrl
	});
}
function detectDevServer(id) {
	return get(endpoint("/detect-dev-server", { id }));
}
function startDevServer(id) {
	return post(endpoint("/dev-server/start", { id }), {});
}
function stopDevServer(id) {
	return post(endpoint("/dev-server/stop", { id }), {});
}
var CHAT_SLOTS = "/api/chat/slots";
/** Slot-detail read; the only endpoint that returns message ENTRIES + queue. */
function slotDetailUrl(key) {
	return CHAT_SLOTS + "/" + encodeURIComponent(key);
}
/** Slot and transcript endpoints only -- all JSON. The SEND goes through the
*  receipt transport (`sendChatMessage` below), which owns `?ws=1`, the
*  deadline and the receipt contract. */
async function chatApi(url, method, body) {
	return parse(await hostFetch(url, {
		method,
		headers: body ? { "Content-Type": "application/json" } : void 0,
		body: body ? JSON.stringify(body) : void 0
	}));
}
/** The send wire: one `POST /api/chat?ws=1` carrying the message and the slot,
*  the body the dashboard's own composer sends, resolving on every HTTP status so
*  the receipt reader sees a 4xx/5xx as a refusal. A scoped-client non-2xx is
*  handed back as that response; any other rejection (no response at all) is
*  rethrown, which the transport reads as `transport-error`, and the deadline's
*  abort as `response-late` -- the dashboard wire's mapping. */
var chatSendWire = async (payload, signal) => {
	try {
		return await currentAppApi().raw("/api/chat?ws=1", {
			method: "POST",
			credentials: "same-origin",
			headers: {
				"Content-Type": "application/json",
				"X-UI-Lang": activeLocale()
			},
			body: JSON.stringify({
				message: payload.message,
				slot: payload.slot
			}),
			signal
		});
	} catch (e) {
		if (typeof e?.status === "number") {
			const body = String(e.body ?? "");
			return {
				ok: false,
				json: async () => JSON.parse(body)
			};
		}
		throw e;
	}
};
/** Create (or adopt) this app's deterministic chat slot. Idempotent server-side. */
function createChatSlot(name, title) {
	return chatApi(CHAT_SLOTS, "POST", {
		name,
		agent: "",
		title
	});
}
/**
* Bind the slot to the project being previewed.
*
* `POST /api/chat/slots` takes no project, so a freshly adopted slot carries
* whatever the dashboard's default is. That is the wrong directory for this app:
* the slot's project is what scopes the chat runner's file search and
* `@`-mentions and what loads `<project>/.kiro/steering`, so without this the
* agent answers an edit request for project B while scoped to project A. The
* seed names the absolute path, which is why the symptom is silent rather than
* loud — file operations still land, but project steering never loads.
*
* Separate call by necessity, and idempotent, so re-binding an already-correct
* slot is a no-op.
*/
function setChatSlotProject(key, project) {
	return chatApi(slotDetailUrl(key) + "/project", "POST", { project });
}
/**
* Read the slot's recent transcript + pending queue, to check whether a sealed
* batch actually reached the session.
*
* `slotKey` MUST be the same key dispatch used (`slotKeyFor(root)`), not a raw
* project path. Slot adopt is idempotent BY NAME, so a raw path silently adopts a
* different, empty slot: every request then reads as undelivered and a junk
* session is left behind. The name is checked below to make that unmissable.
*
* TWO calls, deliberately. `POST /api/chat/slots` adopts the slot and returns
* `serialize_slot()`, whose `messages` is a COUNT (`len(self.messages)`) with no
* `queue` at all — reading it as a list silently finds nothing, which would make
* every sealed request look undelivered and re-enable the duplicate resend this
* check exists to prevent. Only `GET /api/chat/slots/{key}` returns the prepared
* message entries and the pending queue.
*
* Returns `null` when either call fails, which callers must treat as "unknown"
* rather than as either answer.
*/
async function readSlotTranscript(slotKey, title) {
	if (!slotKey || slotKey.includes("/") || slotKey.includes("\\")) return null;
	try {
		let resumed = null;
		try {
			resumed = await chatApi(slotDetailUrl(slotKey) + "/resume", "POST", { key: slotKey });
		} catch {
			resumed = null;
		}
		if (resumed && Array.isArray(resumed.messages)) return {
			messages: resumed.messages,
			queue: resumed.queue,
			hasMore: resumed.has_more === true
		};
		const key = (await createChatSlot(slotKey, title))?.key;
		if (!key) return null;
		const detail = await chatApi(slotDetailUrl(key), "GET");
		if (!detail || !Array.isArray(detail.messages)) return null;
		return {
			messages: detail.messages,
			queue: detail.queue,
			hasMore: detail.has_more === true
		};
	} catch {
		return null;
	}
}
/**
* Send one turn into a slot through the receipt transport (`./sendTurn`, the
* dashboard's chat-core contract restated for a bundle) over `chatSendWire`. Resolves ONLY on a confirmed acceptance -- `dispatched` or `queued`
* -- because the caller marks the request delivered on resolution, and
* `deliveredAt` permanently short-circuits `deliveryVerdict` / `verifyDelivery`.
* Every other status rejects, each with its own reason, so the request stays
* unacknowledged and ground truth (`verifyDelivery` asking the session) decides:
*
* - `refused`: the server said no. The old helper only threw on a non-2xx, so a
*   `{ok:false}` refusal inside a 200 was marked delivered.
* - `transport-error`: no response; as the bare fetch always did.
* - `unknown` / `response-late`: accepted, or accepted for all we know, but not
*   CONFIRMED -- marking delivered here would strand the sealed edits if the
*   POST never landed. The old helper resolved a non-JSON 2xx as `{ok:true}` by
*   accident of a parse fallback; it had no deadline at all.
*/
async function sendChatMessage(message, slot) {
	const receipt = await sendTurn({
		message,
		slot,
		wire: chatSendWire
	});
	switch (receipt.status) {
		case "dispatched":
		case "queued": return;
		case "refused": {
			const err = new Error(receipt.reason || t("common.send_failed"));
			err.name = SEND_REFUSED;
			throw err;
		}
		case "transport-error": throw new Error(t("common.send_failed"));
		case "unknown": throw new Error(t("common.accepted_body_unreadable"));
		case "response-late": throw new Error(t("common.no_response_returned"));
	}
}
/** Deep link into the Chat tab at a given slot. */
function chatRoute(slotKey) {
	return slotKey ? "/chat?" + new URLSearchParams({ sid: slotKey }).toString() : "/chat";
}
// src/prompts.ts
var SESSION_TITLE = (label) => `Design Tweak \u2014 ${label}`;
var SESSION_SEED = (label, path) => `Design Tweak session for "${label}". Working directory: ${path}\nYou handle visual edit requests for this web app. For each request, edit the exact source file, then post a one-line summary. Keep responses concise.`;
var REQUEST_PROMPT = (req, comments, payloadPath) => {
	const list = comments.map((c) => {
		const fu = c.followUpTo ? ` (follow-up to comment ${c.followUpTo})` : "";
		return `  ${req.number}.${c.index} [cid ${c.cid}]${fu}\n      element: ${c.element || `${c.count} elements`}${c.locator ? `  locator: ${c.locator}` : ""}\n      file:    ${c.sourceFile || "(unknown — verify before editing)"}\n      change:  "${c.comment}"`;
	}).join("\n");
	const payload = payloadPath ? `The full payload is at ${payloadPath} — its \`comments\` array carries each comment's \`cid\`, \`sourceFile\`, and \`selection\`, so edit those files directly without searching.\n` : "";
	return `Apply Design Tweak request #${req.number} — ${comments.length} comment${comments.length > 1 ? "s" : ""} (request id ${req.id}).\n\n${list}\n\n` + payload + `Work the comments one at a time. For EACH comment, POST progress to ${threadEndpoint(req.id, "<cid>")} with {"role":"agent","text":"…"}, and when that comment is finished POST {"role":"agent","text":"done — <what changed>","status":"done"}. Report per comment, not once for the batch — each comment has its own progress bubble.\nA comment marked as a follow-up refers to an earlier comment's cid; read that comment's thread in the same file (or in ../handled/) for context before editing.`;
};
// src/delivery.ts
/** Does this request still need something done to complete delivery? */
function needsDeliveryRetry(req) {
	return !req.deliveredAt;
}
/**
* Is this request's batch present in the session — delivered or merely queued?
*
* The queue half is load-bearing: seconds after a send the prompt is accepted
* but not yet turned into a message, so a transcript-only check would read
* "absent" and offer a resend that duplicates it.
*
* A miss is only decisive within the window the host returns (the recent
* transcript, not all history). `deliveryVerdict` is what encodes that limit;
* this function answers the narrower question.
*/
function transcriptHasRequest(t, requestId) {
	if (!t || !requestId) return false;
	const hit = (s) => typeof s === "string" && s.includes(requestId);
	const messages = Array.isArray(t.messages) ? t.messages : [];
	const queue = Array.isArray(t.queue) ? t.queue : [];
	return messages.some((m) => hit(m?.content)) || queue.some((q) => hit(q?.content));
}
function deliveryVerdict(req, t) {
	if (req.deliveredAt) return "delivered";
	if (!t) return "unknown";
	if (transcriptHasRequest(t, req.id)) return "delivered";
	return t.hasMore ? "unknown" : "missing";
}
// src/useDesignTweakPageState.ts
var APP_SLOT_PREFIX = "design-tweak";
var FALLBACK_APP_LABEL = "app";
/**
* FNV-1a over one 32-bit lane. `seed` picks the offset basis, so four lanes
* with different seeds give four independent digests of the same input.
*
* Both bytes of every UTF-16 code unit are mixed. Folding to the low byte
* alone would make `/a/Ā` (U+0100) collide with `/a/\0`, which is exactly the
* class of bug this function replaced.
*/
function fnv1a32(str, seed) {
	let h = seed >>> 0;
	for (let i = 0; i < str.length; i++) {
		const c = str.charCodeAt(i);
		h = Math.imul(h ^ c & 255, 16777619) >>> 0;
		h = Math.imul(h ^ c >>> 8 & 255, 16777619) >>> 0;
	}
	return h >>> 0;
}
/**
* 128-bit digest of a project path, base36 per lane.
*
* This is the slot's IDENTITY, so a collision does not merely look untidy: two
* different projects would resolve to the same chat slot and their turns, seeds
* and session scope would merge into whichever one got there first. The prior
* implementation was a single 32-bit `h * 31 + c` fold, where a collision needs
* no adversary and no birthday luck -- any two paths differing only in their
* last two characters can hit it directly, because `'1' * 31 + 'n'` equals
* `'3' * 31 + '0'`, so `/tmp/project-1n` and `/tmp/project-30` both hashed to
* `19gozug`. Four independent lanes remove that structural class outright.
*
* Deliberately not `crypto.subtle.digest`: it is async, and this runs inside
* the synchronous slot-key derivation on the render path.
*/
function projectSlotDigest(str) {
	const s = str || "";
	return [
		2166136261,
		2654435769,
		2246822507,
		3266489909
	].map((seed) => fnv1a32(s, seed).toString(36)).join("");
}
function slotKeyFor(path) {
	return `${APP_SLOT_PREFIX}-${projectSlotDigest(path || "")}`;
}
/** Poll cadence for the three list endpoints — unchanged from the old interval. */
var POLL_MS = 5e3;
/**
* Query keys. All three lists sit under one `['design-tweak']` prefix so a
* mutation can invalidate the whole set in a single call.
*/
var DT_KEY = {
	all: ["design-tweak"],
	projects: ["design-tweak", "projects"],
	queue: ["design-tweak", "queue"],
	history: ["design-tweak", "history"],
	health: ["design-tweak", "health"]
};
var NO_PROJECTS = [];
var NO_REQUESTS = [];
/**
* The Design Tweak page's state, effects and actions, in the order the page
* registers them. `DesignTweak` calls it as its first hook and renders from the
* returned values; only `deleteReq`, with its native `confirm()`, stays in the
* page.
*/
function useDesignTweakPageState() {
	const ime = useImeGuard();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const [selectedId, setSelectedId] = useState("");
	const [ddOpen, setDdOpen] = useState(false);
	const [ddIn, setDdIn] = useState(false);
	const ddTriggerRef = useRef(null);
	const ddPanelRef = useRef(null);
	const [adding, setAdding] = useState(false);
	const [newPath, setNewPath] = useState("");
	const [detecting, setDetecting] = useState(false);
	const [devOpen, setDevOpen] = useState(false);
	const [devDraft, setDevDraft] = useState("");
	const [starting, setStarting] = useState(false);
	const [devError, setDevError] = useState("");
	const [histOpen, setHistOpen] = useState(false);
	const [previewId, setPreviewId] = useState("");
	const [previewNonce, setPreviewNonce] = useState(1);
	const [dimsMap, setDimsMap] = useState(() => {
		try {
			return JSON.parse(localStorage.getItem("ste_dims_map") || "null") || {};
		} catch {
			return {};
		}
	});
	const [dimsOpen, setDimsOpen] = useState(false);
	const dims = dimsMap[previewId] || "desktop";
	const setDimsFor = useCallback((pid, k) => {
		if (!pid) return;
		setDimsMap((m) => {
			const next = {
				...m,
				[pid]: k
			};
			try {
				localStorage.setItem("ste_dims_map", JSON.stringify(next));
			} catch {}
			return next;
		});
	}, []);
	const [mode, setMode] = useState("preview");
	const [status, setStatus] = useState("");
	const [bridgeError, setBridgeError] = useState("");
	const [reqOpen, setReqOpen] = useState({});
	const [sendingId, setSendingId] = useState("");
	const iframeRef = useRef(null);
	const projectsQuery = useQuery({
		queryKey: DT_KEY.projects,
		queryFn: fetchProjects,
		refetchInterval: POLL_MS,
		retry: false
	});
	const queueQuery = useQuery({
		queryKey: DT_KEY.queue,
		queryFn: fetchQueue,
		refetchInterval: POLL_MS,
		retry: false
	});
	const historyQuery = useQuery({
		queryKey: DT_KEY.history,
		queryFn: fetchHistory,
		refetchInterval: POLL_MS,
		retry: false
	});
	const dataDir = useQuery({
		queryKey: DT_KEY.health,
		queryFn: fetchHealth,
		retry: false
	}).data?.dataDir || "";
	const dataDirRef = useRef(dataDir);
	useEffect(() => {
		dataDirRef.current = dataDir;
	}, [dataDir]);
	const projects = projectsQuery.data?.projects ?? NO_PROJECTS;
	projectsQuery.data?.activeId;
	projectsQuery.data?.serving;
	const pending = queueQuery.data?.pending ?? NO_REQUESTS;
	const history = historyQuery.data?.history ?? NO_REQUESTS;
	const booting = projectsQuery.isPending;
	/** Re-read all three lists. Awaited by callers that need the new state. */
	const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: DT_KEY.all }), [queryClient]);
	useEffect(() => {
		const d = projectsQuery.data;
		if (!d) return;
		setSelectedId((cur) => cur || d.activeId || (d.projects?.[0]?.id ?? ""));
		let wasDisconnected = false;
		try {
			wasDisconnected = localStorage.getItem("ste_disconnected") === "1";
		} catch {}
		if (d.activeId && !wasDisconnected) setPreviewId((cur) => cur || d.activeId);
	}, [projectsQuery.data]);
	const commentIndexRef = useRef({});
	useEffect(() => {
		const idx = {};
		for (const req of [...pending, ...history]) for (const c of req.comments || []) idx[c.cid] = {
			req,
			comment: c
		};
		commentIndexRef.current = idx;
	}, [pending, history]);
	const withFollowUpLabels = useCallback((reqs) => reqs.map((req) => ({
		...req,
		comments: (req.comments || []).map((c) => {
			if (!c.followUpTo) return c;
			const origin = commentIndexRef.current[c.followUpTo];
			return origin ? {
				...c,
				followUpLabel: `${origin.req.number}.${origin.comment.index}`
			} : c;
		})
	})), []);
	useEffect(() => {
		if (!ddOpen) {
			setDdIn(false);
			return;
		}
		const raf = requestAnimationFrame(() => setDdIn(true));
		const onDown = (e) => {
			const inTrigger = ddTriggerRef.current?.contains(e.target);
			const inPanel = ddPanelRef.current?.contains(e.target);
			if (!inTrigger && !inPanel) {
				setDdOpen(false);
				setAdding(false);
			}
		};
		const onKey = (e) => {
			if (e.key === "Escape") {
				setDdOpen(false);
				setAdding(false);
			}
		};
		document.addEventListener("mousedown", onDown, true);
		document.addEventListener("keydown", onKey);
		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener("mousedown", onDown, true);
			document.removeEventListener("keydown", onKey);
		};
	}, [ddOpen]);
	const toggleReq = useCallback((id) => {
		setReqOpen((m) => ({
			...m,
			[id]: !m[id]
		}));
	}, []);
	const seenStatusRef = useRef(null);
	const ensuredSlots = useRef(/* @__PURE__ */ new Map());
	const ensureSlot = useCallback(async (path, label) => {
		const want = slotKeyFor(path);
		if (ensuredSlots.current.has(want)) return ensuredSlots.current.get(want);
		let key = want;
		try {
			const slot = await createChatSlot(want, SESSION_TITLE(label));
			if (slot?.key) key = slot.key;
			try {
				await setChatSlotProject(key, path);
			} catch {}
			if (slot?.messages === 0) await sendChatMessage(SESSION_SEED(label, path), key);
		} catch {}
		ensuredSlots.current.set(want, key);
		return key;
	}, []);
	const previewOriginRef = useRef("");
	const postToOverlay = useCallback((msg) => {
		const target = previewOriginRef.current;
		if (!target) return;
		try {
			iframeRef.current?.contentWindow?.postMessage({
				source: "kiro-ste-host",
				...msg
			}, target);
		} catch {}
	}, []);
	const summarizeEl = useCallback((payload) => {
		const el = payload?.selection?.elements?.[0] || {};
		let name = el.tag || "";
		if (el.id) name += `#${el.id}`;
		else if (el.classes?.length) name += "." + el.classes.slice(0, 2).join(".");
		return name;
	}, []);
	const [railW, setRailW] = useState(() => {
		try {
			return Math.min(800, Math.max(360, parseInt(localStorage.getItem("ste_rail_w") || "", 10) || 500));
		} catch {
			return 500;
		}
	});
	const onDragStart = useCallback((e) => {
		e.preventDefault();
		const startX = e.clientX;
		const startW = railW;
		const onMove = (ev) => {
			const w = Math.min(800, Math.max(360, startW + (ev.clientX - startX)));
			setRailW(w);
		};
		const onUp = (ev) => {
			window.removeEventListener("mousemove", onMove);
			window.removeEventListener("mouseup", onUp);
			const w = Math.min(800, Math.max(360, startW + (ev.clientX - startX)));
			try {
				localStorage.setItem("ste_rail_w", String(w));
			} catch {}
		};
		window.addEventListener("mousemove", onMove);
		window.addEventListener("mouseup", onUp);
	}, [railW]);
	const selected = projects.find((p) => p.id === selectedId);
	const connected = !!previewId && previewId === selectedId;
	const switchTo = useCallback((p) => {
		if (!p) return;
		setSelectedId(p.id);
		setPreviewId(p.id);
		setPreviewNonce(Date.now());
		setMode("preview");
		setStatus("");
		try {
			localStorage.removeItem("ste_disconnected");
		} catch {}
		selectProject(p.id).catch(() => {});
	}, []);
	const connect = useCallback(() => switchTo(selected), [switchTo, selected]);
	const disconnect = useCallback(() => {
		setPreviewId("");
		setStatus("");
		try {
			localStorage.setItem("ste_disconnected", "1");
		} catch {}
	}, []);
	const removeProject$1 = useCallback(async (p) => {
		try {
			const out = await removeProject(p.id);
			if (out?.ok) {
				if (previewId === p.id) setPreviewId("");
				setSelectedId((cur) => cur === p.id ? "" : cur);
				refresh();
			} else setStatus(t("status.remove_failed", { error: out?.error || t("status.unknown") }));
		} catch (err) {
			setStatus(t("status.remove_failed", { error: errMsg(err) }));
		}
	}, [previewId, refresh]);
	const addProject$1 = useCallback(async (pathArg) => {
		const p = (pathArg || newPath).trim();
		if (!p) return;
		try {
			const out = await addProject(p);
			if (out?.ok) {
				setNewPath("");
				setAdding(false);
				setDdOpen(false);
				switchTo(out.project);
				refresh();
				const name = out.project?.name || "";
				setStatus(out.updated === "previewUrl" ? t("status.set_dev_server_for", { name }) : out.existing ? t("status.already_registered", { name }) : out.autoDetected ? t("status.added_found_dev_server", {
					name,
					url: out.project?.previewUrl || ""
				}) : (out.detected || []).length > 1 ? t("status.added_many_dev_servers", {
					name,
					n: (out.detected || []).length
				}) : out.project?.previewUrl ? t("status.added_dev_previewing", { name }) : t("status.added_previewing", { name }));
			} else setStatus(t("status.add_failed", { error: out?.error || t("status.unknown") }));
		} catch (err) {
			setStatus(t("status.add_failed", { error: errMsg(err) }));
		}
	}, [
		newPath,
		refresh,
		switchTo
	]);
	const pickFolder$1 = useCallback(async () => {
		setStatus(t("status.opening_folder_picker"));
		try {
			const out = await pickFolder();
			if (out?.ok && out.path) {
				setStatus("");
				addProject$1(out.path);
			} else if (out?.canceled) setStatus("");
			else {
				setAdding(true);
				setStatus(t("status.picker_unavailable", { error: out?.error || t("status.unknown") }));
			}
		} catch (err) {
			setAdding(true);
			setStatus(t("status.picker_unavailable", { error: errMsg(err) }));
		}
	}, [addProject$1]);
	const deliverSealed = useCallback(async (snap, req) => {
		const sealedComments = snap.comments || [];
		const msg = REQUEST_PROMPT(snap, sealedComments, requestPayloadPath(dataDirRef.current, req.id));
		const proj = projects.find((p) => p.id === previewId);
		const path = snap.projectRoot || req.projectRoot || proj?.path || "";
		const label = proj?.name || FALLBACK_APP_LABEL;
		const key = path ? await ensureSlot(path, label) : "";
		if (!key) {
			setStatus(t("status.no_session_for_request", { number: snap.number ?? req.number }));
			return false;
		}
		try {
			await sendChatMessage(msg, key);
			await markDelivered(req.id).catch(() => {});
			setStatus(t("status.sent_request_to_session", {
				number: snap.number ?? req.number,
				n: sealedComments.length,
				label
			}));
			return true;
		} catch (dispatchErr) {
			if (dispatchErr instanceof Error && dispatchErr.name === "send-refused") {
				setBridgeError(t("common.send_failed_with_error", { error: dispatchErr.message }));
				return false;
			}
			setStatus(t("status.dispatch_failed_unconfirmed", {
				number: snap.number ?? req.number,
				error: errMsg(dispatchErr)
			}));
			return false;
		}
	}, [
		projects,
		previewId,
		ensureSlot
	]);
	const sendRequest$1 = useCallback(async (req) => {
		if (!(req.comments || []).length) return;
		setSendingId(req.id);
		try {
			const sealed = await sendRequest(req.id);
			if (!sealed?.ok) {
				setStatus(t("common.send_failed_with_error", { error: sealed?.error || t("status.unknown") }));
				return;
			}
			if (sealed.already) {
				setStatus(t("status.already_sent", { number: sealed.request?.number ?? req.number }));
				refresh();
				return;
			}
			await deliverSealed(sealed.request || req, req);
			refresh();
		} catch (err) {
			setStatus(t("common.send_failed_with_error", { error: errMsg(err) }));
		} finally {
			setSendingId("");
		}
	}, [refresh, deliverSealed]);
	const [missingIds, setMissingIds] = useState(() => /* @__PURE__ */ new Set());
	const verifyDelivery = useCallback(async (reqs) => {
		const pending = reqs.filter((r) => r.state !== "draft" && needsDeliveryRetry(r));
		if (!pending.length) return;
		const proj = projects.find((p) => p.id === previewId);
		const byRoot = /* @__PURE__ */ new Map();
		for (const r of pending) {
			const root = r.projectRoot || proj?.path || "";
			if (!root) continue;
			const group = byRoot.get(root);
			if (group) group.push(r);
			else byRoot.set(root, [r]);
		}
		if (!byRoot.size) return;
		const missing = [];
		let healed = 0;
		for (const [root, group] of byRoot) {
			const label = projects.find((p) => p.path === root)?.name || proj?.name;
			const transcript = await readSlotTranscript(slotKeyFor(root), SESSION_TITLE(label || FALLBACK_APP_LABEL));
			if (!transcript) continue;
			for (const r of group) {
				const verdict = deliveryVerdict(r, transcript);
				if (verdict === "delivered") {
					await markDelivered(r.id).catch(() => {});
					healed += 1;
				} else if (verdict === "missing") missing.push(r.id);
			}
		}
		setMissingIds(new Set(missing));
		if (healed) refresh();
	}, [
		projects,
		previewId,
		refresh
	]);
	const resendRequest = useCallback(async (req) => {
		setSendingId(req.id);
		try {
			if (await deliverSealed(req, req)) setMissingIds((prev) => {
				if (!prev.has(req.id)) return prev;
				const next = new Set(prev);
				next.delete(req.id);
				return next;
			});
			refresh();
		} catch (err) {
			setStatus(t("common.send_failed_with_error", { error: errMsg(err) }));
		} finally {
			setSendingId("");
		}
	}, [refresh, deliverSealed]);
	const unsettledKey = pending.filter((r) => r.state !== "draft" && needsDeliveryRetry(r)).map((r) => r.id).join(",");
	useEffect(() => {
		if (!unsettledKey) return;
		verifyDelivery(pending);
	}, [unsettledKey, verifyDelivery]);
	const previewIdRef = useRef(previewId);
	useEffect(() => {
		previewIdRef.current = previewId;
	}, [previewId]);
	useEffect(() => {
		async function onMsg(e) {
			if (!e.source || e.source !== iframeRef.current?.contentWindow) return;
			if (previewOriginRef.current && e.origin !== previewOriginRef.current) return;
			const d = e?.data;
			if (!d || d.source !== "kiro-select-to-edit") return;
			if (d.type !== "capture" && d.type !== "dispatch") return;
			if (d.type === "capture" && d.payload) {
				try {
					const out = await submitComment({
						...d.payload,
						projectId: previewIdRef.current
					});
					if (out?.ok) {
						postToOverlay({
							type: "created",
							clientRef: d.clientRef,
							id: out.cid,
							number: out.label,
							status: "new",
							element: summarizeEl(d.payload),
							locator: d.payload?.selection?.elements?.[0]?.locator || "",
							thread: [{
								role: "user",
								text: d.payload.comment
							}]
						});
						setReqOpen((m) => ({
							...m,
							[out.id]: true
						}));
						setBridgeError("");
						setStatus(t("status.added_comment", {
							label: out.label ?? "",
							n: out.commentCount ?? 0,
							number: out.number ?? 0
						}));
						refresh();
					} else {
						const error = out?.error || t("status.unknown");
						setBridgeError(t("status.capture_failed", { error }));
						postToOverlay({
							type: "create_failed",
							clientRef: d.clientRef,
							error
						});
					}
				} catch (err) {
					setBridgeError(t("status.capture_failed", { error: errMsg(err) }));
					postToOverlay({
						type: "create_failed",
						clientRef: d.clientRef,
						error: errMsg(err)
					});
				}
				return;
			}
			if (d.type === "dispatch" && d.id && d.text) {
				try {
					const origin = commentIndexRef.current[d.id];
					if (!origin) {
						const error = t("status.follow_up_origin_missing");
						setBridgeError(error);
						postToOverlay({
							type: "dispatch_failed",
							id: d.id,
							text: d.text,
							error
						});
						return;
					}
					const out = await submitComment({
						type: "visual_edit_request",
						comment: d.text,
						followUpTo: d.id,
						projectId: previewIdRef.current,
						previewUrl: origin.comment.previewUrl,
						selection: {
							mode: "single",
							elements: [{ locator: origin.comment.locator }]
						}
					});
					if (out?.ok) {
						setReqOpen((m) => ({
							...m,
							[out.id]: true
						}));
						setBridgeError("");
						setStatus(t("status.follow_up_added", {
							label: out.label ?? "",
							number: out.number ?? 0
						}));
						refresh();
					} else {
						const error = out?.error || t("status.unknown");
						setBridgeError(t("status.follow_up_failed", { error }));
						postToOverlay({
							type: "dispatch_failed",
							id: d.id,
							text: d.text,
							error
						});
					}
				} catch (err) {
					setBridgeError(t("status.follow_up_failed", { error: errMsg(err) }));
					postToOverlay({
						type: "dispatch_failed",
						id: d.id,
						text: d.text,
						error: errMsg(err)
					});
				}
				return;
			}
		}
		window.addEventListener("message", onMsg);
		return () => window.removeEventListener("message", onMsg);
	}, [
		postToOverlay,
		summarizeEl,
		refresh
	]);
	const previewProject = projects.find((p) => p.id === previewId);
	const belongsToPreview = useCallback((c) => {
		if (!previewId) return false;
		if (c?.projectId) return c.projectId === previewId;
		const root = previewProject?.path;
		if (root && c?.projectRoot) return c.projectRoot === root;
		return (c?.previewUrl || "").includes(`/proxy/${previewId}/`);
	}, [previewId, previewProject]);
	const myPending = useMemo(() => pending.filter((r) => belongsToPreview(r)), [pending, belongsToPreview]);
	const myHistory = useMemo(() => history.filter((r) => belongsToPreview(r)), [history, belongsToPreview]);
	const previewSrc = previewProject?.previewUrl ? loopbackPreviewSrc(previewProject.previewUrl, previewNonce) : "";
	const previewOrigin = useMemo(() => {
		try {
			return new URL(previewSrc, window.location.href).origin;
		} catch {
			return "";
		}
	}, [previewSrc]);
	useEffect(() => {
		previewOriginRef.current = previewOrigin;
	}, [previewOrigin]);
	const [previewState, setPreviewState] = useState("loading");
	const [previewNote, setPreviewNote] = useState("");
	const isCrossOrigin = !!previewProject?.previewUrl;
	const isDevServer = isCrossOrigin && previewProject?.previewMode !== "static";
	const probeOkRef = useRef(false);
	const framedRef = useRef(false);
	const markFramed = useCallback(() => {
		framedRef.current = true;
		setPreviewState((s) => {
			if (!isCrossOrigin) return "ready";
			if (s === "unreachable") return s;
			return probeOkRef.current ? "ready" : s;
		});
	}, [isCrossOrigin]);
	useEffect(() => {
		if (!previewId) return;
		if (!previewSrc) {
			setPreviewState("unreachable");
			setPreviewNote("");
			return;
		}
		setPreviewState("loading");
		setPreviewNote("");
		probeOkRef.current = false;
		framedRef.current = false;
		let cancelled = false;
		const probe = async () => {
			try {
				if (isCrossOrigin) await fetch(previewSrc, {
					mode: "no-cors",
					cache: "no-store"
				});
				else {
					const r = await fetch(previewSrc, { cache: "no-store" });
					if (r.status >= 500) throw new Error(`backend returned ${r.status}`);
				}
				if (cancelled) return;
				probeOkRef.current = true;
				if (framedRef.current) setPreviewState((s) => s === "unreachable" ? s : "ready");
			} catch (err) {
				if (cancelled) return;
				if (framedRef.current && !isCrossOrigin) return;
				setPreviewState("unreachable");
				setPreviewNote(errMsg(err));
			}
		};
		probe();
		const slow = setTimeout(() => {
			if (cancelled) return;
			setPreviewState((s) => s === "loading" ? "unreachable" : s);
			setPreviewNote((n) => n || t("preview.timed_out"));
		}, 12e3);
		return () => {
			cancelled = true;
			clearTimeout(slow);
		};
	}, [
		previewId,
		previewSrc,
		isCrossOrigin
	]);
	const pinItems = useMemo(() => {
		const items = [];
		for (const req of myPending) for (const c of req.comments || []) items.push({
			id: c.cid,
			number: `${req.number}.${c.index}`,
			status: c.status,
			comment: c.comment,
			element: c.element,
			locator: c.locator,
			parentLocator: c.parentLocator,
			point: c.point,
			thread: c.thread || []
		});
		return items;
	}, [myPending]);
	useEffect(() => {
		if (!previewId) return;
		postToOverlay({
			type: "requests",
			items: pinItems
		});
	}, [
		pinItems,
		previewId,
		postToOverlay
	]);
	const focusComment = useCallback((c) => {
		if (c?.cid) postToOverlay({
			type: "toggle",
			id: c.cid
		});
	}, [postToOverlay]);
	const openInChat = useCallback((item) => {
		const proj = projects.find((p) => p.id === previewId);
		const path = item && item.projectRoot || proj?.path || "";
		navigate(chatRoute(path ? slotKeyFor(path) : void 0));
	}, [
		navigate,
		projects,
		previewId
	]);
	const archiveReq = useCallback(async (req) => {
		try {
			await clearRequest(req.id);
			refresh();
		} catch (err) {
			setStatus(t("status.archive_failed", { error: errMsg(err) }));
		}
	}, [refresh]);
	const deleteComment$1 = useCallback(async (req, c) => {
		try {
			const out = await deleteComment(req.id, c.cid);
			if (out?.error) setStatus(out.error);
			refresh();
		} catch (err) {
			setStatus(t("status.remove_failed", { error: errMsg(err) }));
		}
	}, [refresh]);
	useEffect(() => {
		const prev = seenStatusRef.current;
		const cur = {};
		let doneNow = null;
		for (const req of pending) for (const c of req.comments || []) {
			cur[c.cid] = c.status;
			if (belongsToPreview(c) && c.status === "done" && prev && prev[c.cid] && prev[c.cid] !== "done") doneNow = { label: `${req.number}.${c.index}` };
		}
		seenStatusRef.current = cur;
		if (prev && doneNow && previewId) {
			setPreviewNonce(Date.now());
			setStatus(t("status.preview_refreshed", { label: doneNow.label }));
		}
	}, [
		pending,
		previewId,
		belongsToPreview
	]);
	const setDevServer = useCallback(async (url) => {
		if (!previewId) return;
		try {
			const out = await setPreviewUrl(previewId, url);
			if (out?.error) {
				setStatus(out.error);
				return;
			}
			setDevOpen(false);
			setDevDraft("");
			await refresh();
			setPreviewNonce(Date.now());
			const name = previewProject?.name || FALLBACK_APP_LABEL;
			setStatus(url ? t("status.previewing_from_url", {
				name,
				url
			}) : t("status.previewing_from_disk", { name }));
		} catch (err) {
			setStatus(t("status.failed", { error: errMsg(err) }));
		}
	}, [
		previewId,
		previewProject,
		refresh
	]);
	const useDetectedDevServer = useCallback(async () => {
		if (!previewId) return;
		setDetecting(true);
		setStatus(t("status.looking_for_dev_server"));
		try {
			const out = await detectDevServer(previewId);
			if (out?.suggested) {
				await setDevServer(out.suggested);
				return;
			}
			if ((out?.candidates || []).length > 1) {
				setDevOpen(true);
				setDevDraft(out.candidates[0].url);
				setStatus(t("status.servers_match_folder", {
					n: out.candidates.length,
					ports: out.candidates.map((c) => c.port).join(", ")
				}));
				return;
			}
			setDevOpen(true);
			setStatus(t("status.no_dev_server_found"));
		} catch (err) {
			setStatus(t("status.detect_failed", { error: errMsg(err) }));
		} finally {
			setDetecting(false);
		}
	}, [previewId, setDevServer]);
	const startDevServer$1 = useCallback(async () => {
		if (!previewId) return;
		setStarting(true);
		setDevError("");
		setStatus(previewProject?.devCommand ? t("status.starting_command", { command: previewProject.devCommand }) : t("status.starting_dev_server"));
		try {
			const out = await startDevServer(previewId);
			if (!out?.ok) {
				setDevError(out?.error || t("status.could_not_start_dev_server"));
				setStatus("");
				return;
			}
			await refresh();
			setPreviewNonce(Date.now());
			const shown = out.devUrl || out.url || "";
			setStatus(out.adopted ? t("status.using_running_dev_server", { url: shown }) : t("status.dev_server_running", { url: shown }));
		} catch (err) {
			setDevError(errMsg(err));
		} finally {
			setStarting(false);
		}
	}, [
		previewId,
		previewProject,
		refresh
	]);
	useCallback(async () => {
		if (!previewId) return;
		try {
			await stopDevServer(previewId);
			setDevError("");
			await refresh();
			setPreviewNonce(Date.now());
			setStatus(t("status.dev_server_stopped"));
		} catch (err) {
			setStatus(t("status.stop_failed", { error: errMsg(err) }));
		}
	}, [previewId, refresh]);
	return {
		ime,
		selectedId,
		ddOpen,
		setDdOpen,
		ddIn,
		ddTriggerRef,
		ddPanelRef,
		adding,
		setAdding,
		newPath,
		setNewPath,
		detecting,
		devOpen,
		setDevOpen,
		devDraft,
		setDevDraft,
		starting,
		devError,
		histOpen,
		setHistOpen,
		previewId,
		setPreviewNonce,
		dimsOpen,
		setDimsOpen,
		dims,
		setDimsFor,
		mode,
		status,
		setStatus,
		bridgeError,
		setBridgeError,
		reqOpen,
		sendingId,
		iframeRef,
		projects,
		booting,
		refresh,
		withFollowUpLabels,
		toggleReq,
		postToOverlay,
		railW,
		onDragStart,
		selected,
		connected,
		switchTo,
		connect,
		disconnect,
		removeProject: removeProject$1,
		addProject: addProject$1,
		pickFolder: pickFolder$1,
		sendRequest: sendRequest$1,
		missingIds,
		resendRequest,
		previewProject,
		myPending,
		myHistory,
		previewSrc,
		previewState,
		previewNote,
		isDevServer,
		markFramed,
		pinItems,
		focusComment,
		openInChat,
		archiveReq,
		deleteComment: deleteComment$1,
		setDevServer,
		useDetectedDevServer,
		startDevServer: startDevServer$1,
		setEditMode: useCallback((m) => {
			setMode(m);
			try {
				const cs = getComputedStyle(document.documentElement);
				const v = (n) => cs.getPropertyValue(n).trim();
				const theme = {
					accent: v("--accent"),
					accentFg: v("--accent-fg"),
					panel: v("--panel"),
					card: v("--card"),
					bgElevated: v("--bg-elevated"),
					text: v("--text"),
					textStrong: v("--text-strong"),
					muted: v("--muted"),
					border: v("--border"),
					info: v("--info"),
					ok: v("--ok"),
					warn: v("--warn")
				};
				postToOverlay({
					type: "state",
					editMode: m === "edit",
					theme
				});
			} catch {}
		}, [postToOverlay])
	};
}
function errMsg(err) {
	if (err instanceof Error) return err.message;
	if (typeof err === "string") return err;
	try {
		return String(err);
	} catch {
		return t("status.unknown_error");
	}
}
// src/DesignTweakPage.tsx
var DIMS = {
	desktop: "100%",
	tablet: "768px",
	mobile: "390px"
};
var DIM_LABEL_KEY = {
	desktop: "preview.dim_desktop",
	tablet: "preview.dim_tablet",
	mobile: "preview.dim_mobile"
};
function dimLabel(k) {
	return t(DIM_LABEL_KEY[k] ?? DIM_LABEL_KEY.desktop);
}
function dimOptionLabel(k) {
	return k === "desktop" ? dimLabel(k) : `${dimLabel(k)} (${DIMS[k]})`;
}
var REVEAL_CLUSTER = "shrink-0 w-0 h-0 overflow-hidden opacity-0 transition-opacity group-hover:w-auto group-hover:h-auto group-hover:ml-0 group-hover:opacity-100 group-focus-within:w-auto group-focus-within:h-auto group-focus-within:ml-0 group-focus-within:opacity-100 focus-within:w-auto focus-within:h-auto focus-within:ml-0 focus-within:opacity-100 [@media(hover:none)]:w-auto [@media(hover:none)]:h-auto [@media(hover:none)]:ml-0 [@media(hover:none)]:opacity-100";
/** Relative age of an ISO timestamp, through the locale-aware shared helper. */
function ago(iso) {
	if (!iso) return "";
	const ms = Date.parse(iso);
	if (!Number.isFinite(ms)) return "";
	return timeAgo(ms / 1e3);
}
function reqChip(req) {
	const comments = req.comments || [];
	const n = comments.length;
	const done = comments.filter((c) => c.status === "done").length;
	const prog = comments.filter((c) => c.status === "sent").length;
	const queued = n - done - prog;
	if (req.status === "draft") return {
		label: t("requests.chip_not_sent", { n }),
		fg: "var(--muted)",
		bg: "var(--bg-elevated)"
	};
	if (req.status === "done") return {
		label: t("requests.chip_done", { n }),
		fg: "var(--ok)",
		bg: "var(--ok-subtle)"
	};
	const parts = [];
	if (prog) parts.push(t("requests.chip_in_progress", { n: prog }));
	if (done) parts.push(t("requests.chip_done", { n: done }));
	if (queued) parts.push(t("requests.chip_queued", { n: queued }));
	return {
		label: parts.join(", ") || t("requests.chip_in_progress", { n }),
		fg: "var(--accent)",
		bg: "var(--accent-subtle)"
	};
}
var DOT = {
	new: "var(--warn)",
	sent: "var(--accent)",
	done: "var(--ok)"
};
function CommentRow({ req, c, onFocus, onDelete, done }) {
	const lastAgent = (Array.isArray(c.thread) ? c.thread : []).slice().reverse().find((m) => m && m.role !== "user");
	const label = `${req.number}.${c.index}`;
	const canDelete = !done && req.state === "draft";
	const removeLabel = t("comments.remove_from_draft");
	return /* @__PURE__ */ jsxs(Clickable, {
		className: "group flex items-start gap-2.5 px-4 py-2 rounded-md cursor-pointer transition-all hover:bg-bg-hover",
		onClick: () => onFocus && onFocus(c),
		title: t("comments.open_in_preview"),
		children: [
			/* @__PURE__ */ jsx("span", {
				className: "rounded-full shrink-0",
				style: {
					width: "7px",
					height: "7px",
					marginTop: "5px",
					background: DOT[c.status] || DOT.new
				}
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex-1 min-w-0",
				children: [
					/* @__PURE__ */ jsx("div", {
						className: "text-[13px] font-semibold leading-snug text-text",
						style: {
							display: "-webkit-box",
							WebkitLineClamp: 2,
							WebkitBoxOrient: "vertical",
							overflow: "hidden"
						},
						children: c.comment
					}),
					/* @__PURE__ */ jsx("div", {
						className: "text-[12px] text-muted leading-snug truncate mt-0.5",
						children: t("comments.meta", {
							label,
							element: c.element || t("comments.element_count", { n: c.count ?? 0 }),
							ago: ago(c.createdAt)
						})
					}),
					c.followUpTo && /* @__PURE__ */ jsx("div", {
						className: "text-[11px] text-muted truncate mt-0.5",
						children: t("comments.follow_up_to", { label: c.followUpLabel || t("comments.an_earlier_comment") })
					}),
					lastAgent && /* @__PURE__ */ jsx("div", {
						className: "text-[12px] text-muted mt-1 pl-2",
						style: {
							borderLeft: "2px solid var(--border)",
							display: "-webkit-box",
							WebkitLineClamp: 2,
							WebkitBoxOrient: "vertical",
							overflow: "hidden"
						},
						children: lastAgent.text
					})
				]
			}),
			canDelete && /* @__PURE__ */ jsx("div", {
				className: REVEAL_CLUSTER + " -ml-2.5",
				children: /* @__PURE__ */ jsx("button", {
					title: removeLabel,
					"aria-label": removeLabel,
					onClick: (e) => {
						e.stopPropagation();
						onDelete?.(req, c);
					},
					className: "p-1 rounded-md text-muted hover:text-text hover:bg-bg-elevated cursor-pointer shrink-0",
					children: /* @__PURE__ */ jsx(Trash2, { size: 13 })
				})
			})
		]
	});
}
function RequestGroup({ req, open, onToggle, onSend, onResend, sendMissing, sending, onFocusComment, onDeleteComment, onOpenChat, onArchive, onDelete, done }) {
	const comments = req.comments || [];
	const chip = reqChip(req);
	const isDraft = req.status === "draft";
	const FolderGlyph = open ? FolderOpen : Folder;
	const iconBtn = (label, icon, handler) => /* @__PURE__ */ jsx("button", {
		title: label,
		"aria-label": label,
		onClick: (e) => {
			e.stopPropagation();
			handler?.(req);
		},
		className: "p-1 rounded-md text-muted hover:text-text hover:bg-bg-elevated cursor-pointer",
		children: icon
	});
	return /* @__PURE__ */ jsxs("div", {
		className: "mb-0.5",
		children: [/* @__PURE__ */ jsxs(Clickable, {
			className: "group relative flex items-center gap-2 pr-2 py-1.5 rounded-md text-sm text-muted hover:text-text hover:bg-bg-hover transition-all cursor-pointer",
			style: { paddingLeft: "13px" },
			onClick: () => onToggle(req.id),
			children: [
				/* @__PURE__ */ jsx(FolderGlyph, {
					size: 14,
					className: "text-muted shrink-0"
				}),
				/* @__PURE__ */ jsx("span", {
					className: "flex-1 text-[13px] font-medium text-text truncate text-left",
					children: t("requests.request_number", { number: req.number })
				}),
				/* @__PURE__ */ jsx("span", {
					className: "text-[11px] px-2 py-[2px] rounded-full font-medium shrink-0",
					style: {
						color: chip.fg,
						background: chip.bg
					},
					children: chip.label
				}),
				!done && !isDraft && /* @__PURE__ */ jsxs("div", {
					className: "flex items-center gap-0.5 " + REVEAL_CLUSTER + " -ml-2",
					children: [iconBtn(t("requests.open_in_chat"), /* @__PURE__ */ jsx(MessageSquare, { size: 13 }), onOpenChat), /* @__PURE__ */ jsxs(DropdownMenu, { children: [/* @__PURE__ */ jsx(DropdownMenuTrigger, {
						asChild: true,
						children: /* @__PURE__ */ jsx("button", {
							title: t("requests.more_actions", { number: req.number }),
							"aria-label": t("requests.more_actions", { number: req.number }),
							onClick: (e) => e.stopPropagation(),
							className: "p-1 rounded-md text-muted hover:text-text hover:bg-bg-elevated cursor-pointer",
							children: /* @__PURE__ */ jsx(MoreHorizontal, { size: 13 })
						})
					}), /* @__PURE__ */ jsxs(DropdownMenuContent, {
						align: "end",
						onClick: (e) => e.stopPropagation(),
						children: [/* @__PURE__ */ jsxs(DropdownMenuItem, {
							onSelect: () => onArchive?.(req),
							children: [/* @__PURE__ */ jsx(Archive, {
								size: 13,
								className: "shrink-0"
							}), /* @__PURE__ */ jsx("span", { children: t("requests.archive_to_history") })]
						}), /* @__PURE__ */ jsxs(DropdownMenuItem, {
							onSelect: () => onDelete?.(req),
							className: "text-danger",
							children: [/* @__PURE__ */ jsx(Trash2, {
								size: 13,
								className: "shrink-0"
							}), /* @__PURE__ */ jsx("span", { children: t("requests.delete_request") })]
						})]
					})] })]
				})
			]
		}), /* @__PURE__ */ jsx(FolderBody, {
			open,
			children: /* @__PURE__ */ jsxs("div", {
				className: "border-l border-border mb-1 ml-3 pl-1 rounded-bl-md",
				children: [
					comments.length === 0 ? /* @__PURE__ */ jsx("div", {
						className: "px-4 py-2 text-[12px] text-muted",
						children: t("requests.no_comments")
					}) : comments.map((c) => /* @__PURE__ */ jsx(CommentRow, {
						req,
						c,
						done,
						onFocus: onFocusComment,
						onDelete: onDeleteComment
					}, c.cid)),
					isDraft && comments.length > 0 && /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", { className: "mx-3 mt-1 border-b border-border" }), /* @__PURE__ */ jsxs("button", {
						onClick: (e) => {
							e.stopPropagation();
							onSend?.(req);
						},
						disabled: !!sending,
						className: "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-[12px] font-semibold cursor-pointer mt-0.5 disabled:cursor-wait",
						style: {
							background: "var(--accent)",
							color: "var(--accent-fg)",
							opacity: sending ? .7 : 1,
							border: 0
						},
						children: [/* @__PURE__ */ jsx(Send, { size: 13 }), sending ? t("requests.sending") : t("requests.send_request", { number: req.number })]
					})] }),
					!done && !isDraft && sendMissing && comments.length > 0 && /* @__PURE__ */ jsxs("div", { children: [/* @__PURE__ */ jsx("div", { className: "mx-3 mt-1 border-b border-border" }), /* @__PURE__ */ jsxs("button", {
						onClick: (e) => {
							e.stopPropagation();
							onResend?.(req);
						},
						disabled: !!sending,
						className: "w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md text-[12px] font-semibold cursor-pointer mt-0.5 disabled:cursor-wait",
						style: {
							background: "var(--danger)",
							color: "var(--danger-fg)",
							opacity: sending ? .7 : 1,
							border: 0
						},
						children: [/* @__PURE__ */ jsx(Send, { size: 13 }), sending ? t("requests.sending") : t("requests.send_missing_request", { number: req.number })]
					})] })
				]
			})
		})]
	});
}
function DesignTweak() {
	const { ime, selectedId, ddOpen, setDdOpen, ddIn, ddTriggerRef, ddPanelRef, adding, setAdding, newPath, setNewPath, detecting, devOpen, setDevOpen, devDraft, setDevDraft, starting, devError, histOpen, setHistOpen, previewId, setPreviewNonce, dimsOpen, setDimsOpen, dims, setDimsFor, mode, status, setStatus, bridgeError, setBridgeError, reqOpen, sendingId, iframeRef, projects, booting, refresh, withFollowUpLabels, toggleReq, postToOverlay, railW, onDragStart, selected, connected, switchTo, connect, disconnect, removeProject, addProject, pickFolder, sendRequest, missingIds, resendRequest, previewProject, myPending, myHistory, previewSrc, previewState, previewNote, isDevServer, markFramed, pinItems, focusComment, openInChat, archiveReq, deleteComment, setDevServer, useDetectedDevServer, startDevServer, setEditMode } = useDesignTweakPageState();
	const deleteReq = useCallback(async (req) => {
		if (!confirm(t("requests.delete_confirm", { number: req.number }))) return;
		try {
			await deleteRequest(req.id);
			refresh();
		} catch (err) {
			setStatus(t("status.delete_failed", { error: errMsg(err) }));
		}
	}, [refresh, setStatus]);
	const HistChevron = histOpen ? ChevronDown : ChevronRight;
	return /* @__PURE__ */ jsxs("div", {
		className: "flex h-full min-h-0",
		style: { padding: "8px 12px" },
		children: [
			/* @__PURE__ */ jsxs("div", {
				className: "shrink-0 flex flex-col min-h-0",
				style: {
					width: `${railW}px`,
					border: "1px solid var(--border)",
					borderRadius: "16px",
					overflow: "hidden"
				},
				children: [
					/* @__PURE__ */ jsx("div", {
						className: "flex items-start gap-3 px-5 pt-4 pb-2",
						children: /* @__PURE__ */ jsxs("div", {
							className: "flex-1 min-w-0",
							children: [/* @__PURE__ */ jsx("div", {
								className: "text-[20px] font-bold text-text-strong leading-tight",
								children: t("page.title")
							}), /* @__PURE__ */ jsx("div", {
								className: "text-[12px] text-muted mt-0.5",
								children: t("page.tagline")
							})]
						})
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-3 px-5 py-2",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "flex-1 min-w-0",
							style: { position: "relative" },
							children: [/* @__PURE__ */ jsxs("button", {
								ref: ddTriggerRef,
								onClick: () => {
									setDdOpen(!ddOpen);
									setAdding(false);
								},
								className: "w-full flex items-center gap-2 h-10 px-3 rounded-xl bg-bg-elevated border border-border text-[13px] font-bold text-text cursor-pointer",
								children: [
									/* @__PURE__ */ jsx(Folder, {
										size: 16,
										className: "shrink-0 text-muted"
									}),
									/* @__PURE__ */ jsx("span", {
										className: "truncate",
										children: selected ? selected.name : t("projects.select_app")
									}),
									/* @__PURE__ */ jsx(ChevronDown, {
										size: 16,
										className: "ml-auto shrink-0 text-muted"
									})
								]
							}), ddOpen && /* @__PURE__ */ jsxs("div", {
								ref: ddPanelRef,
								className: "rounded-xl border border-border bg-card shadow-lg overflow-hidden",
								style: {
									position: "absolute",
									top: "calc(100% + 4px)",
									left: 0,
									right: 0,
									zIndex: 20,
									transformOrigin: "top center",
									transform: ddIn ? "translateY(0)" : "translateY(-4px)",
									opacity: ddIn ? 1 : 0,
									transition: "transform 130ms cubic-bezier(.4,0,.2,1), opacity 110ms ease-out"
								},
								children: [/* @__PURE__ */ jsx("div", {
									style: {
										maxHeight: "180px",
										overflowY: "auto"
									},
									children: booting && projects.length === 0 ? /* @__PURE__ */ jsxs("div", {
										className: "px-3 py-3 flex items-center gap-2 text-[13px] text-muted",
										children: [/* @__PURE__ */ jsx(RefreshCw, {
											size: 13,
											className: "animate-spin"
										}), t("projects.loading")]
									}) : projects.length === 0 ? /* @__PURE__ */ jsx("div", {
										className: "px-3 py-3 text-[13px] text-muted",
										children: t("projects.none_loaded")
									}) : projects.map((p) => /* @__PURE__ */ jsxs(Clickable, {
										onClick: () => {
											switchTo(p);
											setDdOpen(false);
										},
										className: `group w-full flex items-center gap-2 h-10 px-3 text-left text-[13px] cursor-pointer hover:bg-bg-elevated ${p.id === selectedId ? "text-text font-bold" : "text-muted"}`,
										children: [
											/* @__PURE__ */ jsx(Folder, {
												size: 14,
												className: "shrink-0"
											}),
											/* @__PURE__ */ jsx("span", {
												className: "truncate flex-1",
												children: p.name
											}),
											(p.needsDevServer || p.previewUrl) && /* @__PURE__ */ jsx("span", {
												title: p.previewUrl ? t("projects.previewing_from", { url: p.previewUrl }) : t("projects.needs_dev_server", { command: p.devCommand || t("projects.no_dev_script") }),
												className: "shrink-0 text-[10px] px-1.5 rounded-full",
												style: {
													paddingTop: "1px",
													paddingBottom: "1px",
													color: p.previewUrl ? "var(--accent)" : "var(--muted)",
													background: p.previewUrl ? "var(--accent-subtle)" : "var(--bg-elevated)"
												},
												children: t("projects.dev_badge")
											}),
											/* @__PURE__ */ jsx("button", {
												title: t("projects.remove_from_list"),
												"aria-label": t("projects.remove_from_list"),
												onClick: (e) => {
													e.stopPropagation();
													removeProject(p);
												},
												className: "flex items-center justify-center text-muted hover:text-text hover:bg-bg-elevated cursor-pointer opacity-0 transition-opacity group-hover:opacity-100 [@media(hover:none)]:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
												style: {
													width: "22px",
													height: "22px",
													borderRadius: "6px",
													flex: "0 0 auto"
												},
												children: /* @__PURE__ */ jsx(X, { size: 14 })
											})
										]
									}, p.id))
								}), /* @__PURE__ */ jsx("div", {
									className: "border-t border-border",
									children: adding ? /* @__PURE__ */ jsxs("div", {
										className: "flex items-center gap-2 p-2",
										children: [/* @__PURE__ */ jsx("input", {
											value: newPath,
											autoFocus: true,
											onChange: (e) => setNewPath(e.target.value),
											...ime.bindEnter({ onEnter: () => addProject() }),
											placeholder: t("projects.path_placeholder"),
											className: "flex-1 h-8 px-2 rounded-md bg-bg-elevated border border-border text-[12px] text-text"
										}), /* @__PURE__ */ jsx("button", {
											onClick: () => addProject(),
											className: "h-8 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-bold cursor-pointer",
											children: t("projects.add")
										})]
									}) : /* @__PURE__ */ jsxs("button", {
										onClick: pickFolder,
										title: t("projects.browse_or_type_path"),
										className: "w-full flex items-center gap-2 h-10 px-3 text-[13px] text-muted hover:text-text hover:bg-bg-elevated cursor-pointer",
										children: [/* @__PURE__ */ jsx(Plus, { size: 14 }), t("projects.load_new_app")]
									})
								})]
							})]
						}), connected ? /* @__PURE__ */ jsx("button", {
							onClick: disconnect,
							title: t("projects.click_again_to_disconnect"),
							className: "shrink-0 h-10 px-4 text-[13px] font-bold text-text cursor-pointer hover:bg-bg-elevated",
							style: {
								background: "transparent",
								border: "1px solid var(--border)",
								borderRadius: "12px"
							},
							children: t("projects.connected")
						}) : /* @__PURE__ */ jsx("button", {
							onClick: connect,
							disabled: !selected,
							className: "shrink-0 h-10 px-4 bg-accent text-accent-fg text-[13px] font-bold cursor-pointer disabled:opacity-40",
							style: { borderRadius: "12px" },
							children: t("projects.connect")
						})]
					}),
					status && /* @__PURE__ */ jsx("div", {
						className: "px-5 py-1 text-[11px] text-muted truncate",
						children: status
					}),
					/* @__PURE__ */ jsx(ErrorNotice, {
						message: bridgeError,
						onDismiss: () => setBridgeError(""),
						className: "mx-5 my-1"
					}),
					/* @__PURE__ */ jsxs("div", {
						className: "flex-1 min-h-0 flex flex-col",
						children: [/* @__PURE__ */ jsx("div", {
							className: "flex-1 min-h-0 overflow-y-auto px-2",
							children: booting ? /* @__PURE__ */ jsxs("div", {
								className: "py-6 px-3 flex items-center gap-2 text-[13px] text-muted",
								children: [/* @__PURE__ */ jsx(RefreshCw, {
									size: 14,
									className: "animate-spin"
								}), t("projects.loading_your_apps")]
							}) : myPending.length === 0 ? /* @__PURE__ */ jsx("div", {
								className: "py-6 px-3 text-[13px] text-muted",
								children: !previewId ? t("requests.empty_no_app") : t("requests.empty_for_app", { name: previewProject?.name || t("requests.this_app") })
							}) : withFollowUpLabels(myPending).slice().reverse().map((req) => /* @__PURE__ */ jsx(RequestGroup, {
								req,
								done: false,
								open: reqOpen[req.id] !== false,
								onToggle: toggleReq,
								onSend: sendRequest,
								onResend: resendRequest,
								sendMissing: missingIds.has(req.id),
								sending: sendingId === req.id,
								onFocusComment: focusComment,
								onDeleteComment: deleteComment,
								onOpenChat: openInChat,
								onArchive: archiveReq,
								onDelete: deleteReq
							}, req.id))
						}), /* @__PURE__ */ jsxs("div", {
							className: "shrink-0 border-t border-border",
							children: [histOpen && myHistory.length > 0 && /* @__PURE__ */ jsx("div", {
								className: "overflow-y-auto px-2 border-b border-border/60",
								style: { maxHeight: "38vh" },
								children: withFollowUpLabels(myHistory).map((req) => /* @__PURE__ */ jsx(RequestGroup, {
									req,
									done: true,
									open: reqOpen[req.id] === true,
									onToggle: toggleReq,
									onFocusComment: focusComment
								}, req.id))
							}), /* @__PURE__ */ jsxs("button", {
								onClick: () => setHistOpen(!histOpen),
								className: "w-full flex items-center gap-2 px-5 text-[15px] font-bold text-text cursor-pointer hover:bg-bg-elevated/40",
								style: { height: "56px" },
								children: [
									/* @__PURE__ */ jsx(HistChevron, {
										size: 16,
										className: "text-muted"
									}),
									/* @__PURE__ */ jsx(History, {
										size: 15,
										className: "text-muted"
									}),
									t("requests.history"),
									/* @__PURE__ */ jsxs("span", {
										className: "text-[12px] text-muted font-normal",
										children: [
											"(",
											myHistory.length,
											")"
										]
									})
								]
							})]
						})]
					})
				]
			}),
			/* @__PURE__ */ jsx("div", {
				role: "separator",
				"aria-orientation": "vertical",
				"aria-label": t("layout.drag_to_resize"),
				onMouseDown: onDragStart,
				title: t("layout.drag_to_resize"),
				className: "shrink-0 cursor-col-resize",
				style: { width: "11px" }
			}),
			/* @__PURE__ */ jsxs("div", {
				className: "flex-1 min-w-0 flex flex-col min-h-0",
				style: {
					border: "1px solid var(--border)",
					borderRadius: "16px",
					overflow: "hidden"
				},
				children: [previewId && previewProject?.needsDevServer && !previewProject?.previewUrl ? /* @__PURE__ */ jsx("div", {
					className: "flex-1 min-h-0 flex items-center justify-center p-6",
					children: /* @__PURE__ */ jsxs("div", {
						className: "flex flex-col items-start gap-3",
						style: { maxWidth: "460px" },
						children: [
							/* @__PURE__ */ jsx("div", {
								className: "text-[15px] font-bold text-text",
								children: t("preview.needs_dev_server_title")
							}),
							/* @__PURE__ */ jsx("div", {
								className: "text-[13px] text-muted leading-snug",
								children: previewProject.unbundledEntry ? t("preview.unbundled_entry", { entry: previewProject.unbundledEntry }) : t("preview.no_html_entry")
							}),
							previewProject.devCommand ? /* @__PURE__ */ jsx("button", {
								onClick: startDevServer,
								disabled: starting,
								className: "h-9 px-4 rounded-xl text-[13px] font-bold cursor-pointer disabled:cursor-wait",
								style: {
									background: "var(--accent)",
									color: "var(--accent-fg)",
									border: 0
								},
								children: starting ? t("preview.starting") : t("preview.start_dev_server")
							}) : /* @__PURE__ */ jsx("div", {
								className: "text-[12px]",
								style: { color: "var(--warn)" },
								children: t("preview.no_dev_script_in_package_json")
							}),
							previewProject.devCommand && /* @__PURE__ */ jsx("div", {
								className: "text-[11px] text-muted",
								children: t("preview.runs_command_in_project", {
									command: previewProject.devCommand,
									name: previewProject.name || ""
								})
							}),
							/* @__PURE__ */ jsx(ErrorNotice, {
								message: devError,
								askAgent: !devOpen,
								className: "w-full"
							})
						]
					})
				}) : previewId ? /* @__PURE__ */ jsxs("div", {
					className: "flex-1 min-h-0 flex items-center justify-center p-3",
					style: { position: "relative" },
					children: [/* @__PURE__ */ jsx("iframe", {
						ref: iframeRef,
						src: previewSrc,
						onLoad: () => {
							markFramed();
							setEditMode(mode);
							postToOverlay({
								type: "requests",
								items: pinItems
							});
						},
						title: t("preview.frame_title"),
						style: {
							width: DIMS[dims],
							height: "100%",
							border: "1px solid var(--border, #4a464f)",
							borderRadius: 8,
							background: "#fff",
							maxWidth: "100%"
						},
						sandbox: "allow-scripts allow-same-origin allow-forms"
					}), previewState !== "ready" && /* @__PURE__ */ jsx("div", {
						style: {
							position: "absolute",
							inset: "12px",
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							borderRadius: 8,
							background: "var(--panel)",
							textAlign: "center",
							padding: "24px"
						},
						children: previewState === "loading" ? /* @__PURE__ */ jsxs("div", {
							className: "flex flex-col items-center gap-2",
							children: [
								/* @__PURE__ */ jsx(RefreshCw, {
									size: 18,
									className: "text-muted animate-spin"
								}),
								/* @__PURE__ */ jsx("div", {
									className: "text-[13px] text-text",
									children: t("preview.loading_name", { name: previewProject?.name || t("preview.fallback_name") })
								}),
								isDevServer && /* @__PURE__ */ jsx("div", {
									className: "text-[12px] text-muted",
									children: previewProject?.previewUrl
								})
							]
						}) : /* @__PURE__ */ jsxs("div", {
							className: "flex flex-col items-center gap-2",
							style: { maxWidth: "420px" },
							children: [
								/* @__PURE__ */ jsx("div", {
									className: "text-[13px] font-bold text-text",
									children: isDevServer ? t("preview.dev_server_not_reachable") : t("preview.not_reachable")
								}),
								/* @__PURE__ */ jsx("div", {
									className: "text-[12px] text-muted leading-snug",
									children: isDevServer ? t("preview.nothing_answered_at", { url: previewProject?.previewUrl || "" }) : t("preview.backend_did_not_answer")
								}),
								previewNote && /* @__PURE__ */ jsxs("div", {
									className: "text-[11px] text-muted",
									children: [
										"(",
										previewNote,
										")"
									]
								}),
								/* @__PURE__ */ jsx("button", {
									onClick: () => setPreviewNonce(Date.now()),
									className: "mt-1 h-8 px-3 rounded-md text-[12px] font-bold cursor-pointer",
									style: {
										background: "var(--accent)",
										color: "var(--accent-fg)",
										border: 0
									},
									children: t("preview.retry")
								})
							]
						})
					})]
				}) : /* @__PURE__ */ jsx("div", {
					className: "flex-1 flex items-center justify-center text-muted text-sm text-center",
					style: {
						paddingLeft: "40px",
						paddingRight: "40px"
					},
					children: booting ? /* @__PURE__ */ jsxs("div", {
						className: "flex flex-col items-center gap-2",
						children: [/* @__PURE__ */ jsx(RefreshCw, {
							size: 18,
							className: "animate-spin"
						}), /* @__PURE__ */ jsx("div", { children: t("projects.looking_for_connected_apps") })]
					}) : t("projects.no_app_selected")
				}), /* @__PURE__ */ jsxs("div", {
					className: "shrink-0 flex items-center justify-between px-3",
					style: {
						height: "56px",
						borderTop: "1px solid var(--border)"
					},
					children: [/* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-1",
						children: [/* @__PURE__ */ jsxs("div", {
							className: "relative",
							children: [/* @__PURE__ */ jsxs("button", {
								onClick: () => setDimsOpen(!dimsOpen),
								className: "flex items-center gap-2 h-8 px-3 rounded-xl text-[13px] text-text cursor-pointer hover:bg-bg-elevated",
								children: [
									/* @__PURE__ */ jsx(Monitor, { size: 15 }),
									/* @__PURE__ */ jsxs("span", {
										className: "font-bold",
										children: [t("preview.dimensions"), ":"]
									}),
									/* @__PURE__ */ jsx("span", { children: dimLabel(dims) }),
									/* @__PURE__ */ jsx(ChevronDown, {
										size: 14,
										className: "text-muted"
									})
								]
							}), dimsOpen && /* @__PURE__ */ jsx("div", {
								className: "rounded-xl border border-border bg-card shadow-lg overflow-hidden",
								style: {
									position: "absolute",
									bottom: "40px",
									left: 0,
									minWidth: "180px",
									zIndex: 30
								},
								children: Object.keys(DIMS).map((k) => /* @__PURE__ */ jsx("button", {
									onClick: () => {
										setDimsFor(previewId, k);
										setDimsOpen(false);
									},
									className: `block w-full text-left px-4 h-9 text-[13px] cursor-pointer hover:bg-bg-elevated ${k === dims ? "text-text font-bold" : "text-muted"}`,
									children: dimOptionLabel(k)
								}, k))
							})]
						}), previewId && /* @__PURE__ */ jsx("div", {
							className: "relative",
							children: previewProject?.previewUrl && !devOpen ? /* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-1 h-8 pl-2 pr-1 rounded-xl",
								style: { background: "var(--accent-subtle)" },
								children: [/* @__PURE__ */ jsx("span", {
									className: "text-[12px]",
									style: { color: "var(--accent)" },
									children: previewProject.previewUrl.replace(/^https?:\/\//, "")
								}), /* @__PURE__ */ jsx("button", {
									title: t("devServer.preview_from_disk_instead"),
									"aria-label": t("devServer.preview_from_disk_instead"),
									onClick: () => setDevServer(""),
									className: "p-1 rounded-md cursor-pointer",
									style: { color: "var(--accent)" },
									children: /* @__PURE__ */ jsx(X, { size: 13 })
								})]
							}) : !devOpen ? /* @__PURE__ */ jsxs("button", {
								onClick: useDetectedDevServer,
								disabled: detecting,
								title: t("devServer.detect_hint"),
								className: "flex items-center gap-2 h-8 px-3 rounded-xl text-[13px] text-muted hover:text-text hover:bg-bg-elevated cursor-pointer disabled:cursor-wait",
								children: [/* @__PURE__ */ jsx(Eye, { size: 15 }), detecting ? t("devServer.looking") : t("devServer.dev_server")]
							}) : /* @__PURE__ */ jsxs("div", {
								className: "flex items-center gap-1",
								children: [/* @__PURE__ */ jsx("input", {
									value: devDraft,
									autoFocus: true,
									onChange: (e) => setDevDraft(e.target.value),
									...ime.bindEnter({
										onEnter: () => setDevServer(devDraft.trim()),
										onEscape: () => {
											setDevOpen(false);
											setDevDraft("");
										}
									}),
									placeholder: t("devServer.url_placeholder"),
									className: "h-8 px-2 rounded-md bg-bg-elevated border border-border text-[12px] text-text",
									style: { width: "190px" }
								}), /* @__PURE__ */ jsx("button", {
									onClick: () => setDevServer(devDraft.trim()),
									className: "h-8 px-2 rounded-md text-[12px] font-bold cursor-pointer",
									style: {
										background: "var(--accent)",
										color: "var(--accent-fg)",
										border: 0
									},
									children: t("devServer.use")
								})]
							})
						})]
					}), /* @__PURE__ */ jsxs("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ jsx("button", {
							title: t("preview.refresh_preview"),
							"aria-label": t("preview.refresh_preview"),
							onClick: () => previewId && setPreviewNonce(Date.now()),
							disabled: !previewId,
							className: "p-2 rounded-md text-muted hover:text-text hover:bg-bg-elevated cursor-pointer disabled:opacity-40",
							children: /* @__PURE__ */ jsx(RefreshCw, { size: 15 })
						}), /* @__PURE__ */ jsxs("div", {
							className: "flex items-center gap-1",
							style: {
								background: "rgba(0,0,0,0.25)",
								borderRadius: "14px",
								border: "1px solid var(--border)",
								padding: "4px"
							},
							children: [/* @__PURE__ */ jsxs("button", {
								onClick: () => setEditMode("preview"),
								className: `flex items-center justify-center gap-1.5 h-8 px-3 text-[13px] font-bold cursor-pointer transition-all ${mode === "preview" ? "text-accent-fg" : "text-text hover:text-text"}`,
								style: {
									borderRadius: "10px",
									background: mode === "preview" ? "var(--accent)" : "transparent"
								},
								children: [/* @__PURE__ */ jsx(Eye, { size: 14 }), t("modes.preview")]
							}), /* @__PURE__ */ jsxs("button", {
								onClick: () => setEditMode("edit"),
								className: `flex items-center justify-center gap-1.5 h-8 px-3 text-[13px] font-bold cursor-pointer transition-all ${mode === "edit" ? "text-accent-fg" : "text-text hover:text-text"}`,
								style: {
									borderRadius: "10px",
									background: mode === "edit" ? "var(--accent)" : "transparent"
								},
								children: [/* @__PURE__ */ jsx(Pencil, { size: 14 }), t("modes.edit")]
							})]
						})]
					})]
				})]
			})
		]
	});
}
// src/index.tsx
/**
* The bundle's entry: AppHost lazy-imports this module and renders its default
* export as the app's page.
*
* Subscribing to the host's language generation here is what repaints the page
* on a language switch: `t` reads the active locale at call time, and this
* component's re-render reaches every child. The host's scoped API client is
* bound here too, before the page's first request (see `appApi.ts`).
*/
function DesignTweakApp() {
	useLanguageGeneration();
	bindAppApi(useAppApi());
	return /* @__PURE__ */ jsx(DesignTweak, {});
}
export { DesignTweakApp as default };
