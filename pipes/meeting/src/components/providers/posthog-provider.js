"use strict";
'use client';
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = PostHogProvider;
const posthog_js_1 = __importDefault(require("posthog-js"));
const react_1 = require("posthog-js/react");
const navigation_1 = require("next/navigation");
const react_2 = require("react");
const react_3 = require("react");
// Separate component for page view tracking to handle suspense
function PageViewTracker() {
    const pathname = (0, navigation_1.usePathname)();
    const searchParams = (0, navigation_1.useSearchParams)();
    (0, react_2.useEffect)(() => {
        if (pathname) {
            let url = window.origin + pathname;
            if (searchParams.toString()) {
                url = url + `?${searchParams.toString()}`;
            }
            posthog_js_1.default.capture('$pageview', {
                $current_url: url,
            });
        }
    }, [pathname, searchParams]);
    return null;
}
function PostHogProvider({ children, }) {
    (0, react_2.useEffect)(() => {
        if (typeof window !== 'undefined') {
            const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_API_KEY;
            if (!posthogKey) {
                console.warn('posthog: missing NEXT_PUBLIC_POSTHOG_API_KEY');
                return;
            }
            posthog_js_1.default.init(posthogKey, {
                api_host: 'https://app.posthog.com',
                capture_pageview: false,
                bootstrap: {
                    distinctID: process.env.NODE_ENV,
                },
                debug: false,
            });
        }
    }, []);
    return (<react_1.PostHogProvider client={posthog_js_1.default}>
      <react_3.Suspense>
        <PageViewTracker />
      </react_3.Suspense>
      {children}
    </react_1.PostHogProvider>);
}
