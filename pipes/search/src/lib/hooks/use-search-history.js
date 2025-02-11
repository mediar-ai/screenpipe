"use strict";
"use client";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSearchHistory = useSearchHistory;
const react_1 = require("react");
const localforage_1 = __importDefault(require("localforage"));
const HISTORY_KEY = 'screenpipe-search-history';
function useSearchHistory() {
    const [searches, setSearches] = (0, react_1.useState)([]);
    const [currentSearchId, setCurrentSearchId] = (0, react_1.useState)(null);
    const [isLoading, setIsLoading] = (0, react_1.useState)(true);
    const [isCollapsed, setIsCollapsed] = (0, react_1.useState)(true);
    (0, react_1.useEffect)(() => {
        loadSearches();
    }, []);
    const loadSearches = () => __awaiter(this, void 0, void 0, function* () {
        try {
            const stored = yield localforage_1.default.getItem(HISTORY_KEY);
            setSearches(stored || []);
        }
        catch (error) {
            console.error('failed to load search history:', error);
        }
        setIsLoading(false);
    });
    const saveSearches = (updated) => __awaiter(this, void 0, void 0, function* () {
        try {
            yield localforage_1.default.setItem(HISTORY_KEY, updated);
            setSearches(updated);
        }
        catch (error) {
            console.error('failed to save search history:', error);
        }
    });
    const addSearch = (searchParams, results) => __awaiter(this, void 0, void 0, function* () {
        const timestamp = new Date().toISOString();
        const newSearch = {
            id: crypto.randomUUID(),
            query: searchParams.q || '',
            timestamp,
            searchParams,
            results,
            messages: [{
                    id: crypto.randomUUID(),
                    type: 'search',
                    content: searchParams.q || '',
                    timestamp
                }]
        };
        const updated = [newSearch, ...searches];
        yield saveSearches(updated);
        setCurrentSearchId(newSearch.id);
        return newSearch.id;
    });
    const addAIResponse = (searchId, response) => __awaiter(this, void 0, void 0, function* () {
        const timestamp = new Date().toISOString();
        const updated = searches.map(search => {
            if (search.id === searchId) {
                return Object.assign(Object.assign({}, search), { messages: [...search.messages, {
                            id: crypto.randomUUID(),
                            type: 'ai',
                            content: response,
                            timestamp
                        }] });
            }
            return search;
        });
        yield saveSearches(updated);
    });
    const deleteSearch = (id) => __awaiter(this, void 0, void 0, function* () {
        const updated = searches.filter(s => s.id !== id);
        yield saveSearches(updated);
        if (currentSearchId === id) {
            setCurrentSearchId(null);
        }
    });
    const toggleCollapse = () => {
        setIsCollapsed(!isCollapsed);
    };
    return {
        searches,
        currentSearchId,
        setCurrentSearchId,
        addSearch,
        addAIResponse,
        deleteSearch,
        isLoading,
        isCollapsed,
        toggleCollapse
    };
}
