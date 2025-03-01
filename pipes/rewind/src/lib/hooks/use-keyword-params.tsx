import { useQueryStates } from "nuqs";
import { queryParser } from "../utils";

export const useKeywordParams = () => {
	return useQueryStates(queryParser, { throttleMs: 100 });
};
