"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSqlAutocomplete = useSqlAutocomplete;
const react_1 = require("react");
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const cache = {};
function useSqlAutocomplete(type) {
    const [items, setItems] = (0, react_1.useState)([]);
    const [isLoading, setIsLoading] = (0, react_1.useState)(false);
    const fetchItems = (0, react_1.useCallback)(() => __awaiter(this, void 0, void 0, function* () {
        setIsLoading(true);
        try {
            const cachedData = cache[type];
            if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
                setItems(cachedData.data);
            }
            else {
                const query = `
          SELECT ${type === "app" ? "ocr.app_name" : "ocr.window_name"} as name, COUNT(*) as count
          FROM ocr_text ocr
          JOIN frames f ON ocr.frame_id = f.id
          WHERE f.timestamp > datetime('now', '-7 days')
          GROUP BY ${type === "app" ? "ocr.app_name" : "ocr.window_name"}
          ORDER BY count DESC
          LIMIT 100
        `;
                const response = yield fetch("http://localhost:3030/raw_sql", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ query }),
                });
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                const result = yield response.json();
                setItems(result);
                cache[type] = { data: result, timestamp: Date.now() };
            }
        }
        catch (error) {
            console.error("failed to fetch items:", error);
        }
        finally {
            setIsLoading(false);
        }
    }), [type]);
    (0, react_1.useEffect)(() => {
        fetchItems();
    }, [fetchItems]);
    return { items, isLoading };
}
