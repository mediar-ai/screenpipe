import { removeStopwords, eng } from "stopword";

interface KeywordResult {
	keywords: string[];
}

class KeywordParser {
	private additionalStopWords: Set<string>;

	constructor() {
		// Additional stop words that might be missed by the library
		this.additionalStopWords = new Set([
			// Question words and related terms
			"when",
			"where",
			"what",
			"which",
			"who",
			"whom",
			"whose",
			"why",
			"how",

			// Negations and quantities
			"not",
			"none",
			"no",
			"nothing",
			"never",
			"neither",
			"nor",

			// Common verbs and auxiliaries
			"am",
			"is",
			"are",
			"was",
			"were",
			"be",
			"being",
			"been",
			"have",
			"has",
			"had",
			"having",
			"do",
			"does",
			"did",
			"doing",
			"can",
			"could",
			"will",
			"would",
			"shall",
			"should",
			"may",
			"might",
			"must",

			// Prepositions and articles
			"in",
			"on",
			"at",
			"to",
			"for",
			"with",
			"by",
			"from",
			"up",
			"down",
			"into",
			"onto",
			"upon",
			"under",
			"below",
			"above",
			"over",
			"through",
			"after",
			"before",
			"during",
			"within",
			"throughout",

			// Conjunctions
			"and",
			"or",
			"but",
			"nor",
			"yet",
			"so",
			"although",
			"though",
			"while",
			"if",
			"unless",
			"until",
			"because",

			// Pronouns
			"i",
			"me",
			"my",
			"mine",
			"myself",
			"you",
			"your",
			"yours",
			"yourself",
			"he",
			"him",
			"his",
			"himself",
			"she",
			"her",
			"hers",
			"herself",
			"it",
			"its",
			"itself",
			"we",
			"us",
			"our",
			"ours",
			"ourselves",
			"they",
			"them",
			"their",
			"theirs",
			"themselves",

			// Common adverbs
			"very",
			"really",
			"quite",
			"rather",
			"somewhat",
			"just",
			"only",
			"even",
			"still",
			"again",
			"too",
			"also",
			"perhaps",
			"maybe",
			"here",
			"there",
			"now",
			"then",
			"always",
			"never",

			// Others
			"like",
			"want",
			"wanted",
			"wants",
			"need",
			"needs",
			"needed",
			"get",
			"gets",
			"got",
			"getting",
			"make",
			"makes",
			"made",
			"making",
			"use",
			"uses",
			"used",
			"using",
			"way",
			"ways",
			"thing",
			"things",
			"etc",
			"etc.",
			"yeah",
			"yes",
			"no",
			"ok",
			"okay",
			"would",
			"could",
			"should",
			"shall",
			"able",
			"unable",
			"lot",
			"lots",
			"much",
			"many",
			"several",
			"few",
			"little",
			"every",
			"each",
			"any",
			"some",
			"all",
		]);
	}

	private cleanText(text: string): string {
		// Convert to lowercase and remove special characters
		return text.toLowerCase().replace(/[^\w\s]/g, "");
	}

	private tokenize(text: string): string[] {
		// Split text into words
		return text.split(/\s+/).filter((word) => word.length > 0);
	}

	public parse(text: string): KeywordResult {
		const cleanedText = this.cleanText(text);
		const tokens = this.tokenize(cleanedText);

		// First remove library stopwords
		let keywords = removeStopwords(tokens, [
			...eng,
			...this.additionalStopWords,
		]);

		// Filter out single characters only
		keywords = keywords.filter((word) => word.length > 1);

		// Remove duplicates
		const uniqueKeywords = Array.from(new Set(keywords));

		return { keywords: uniqueKeywords };
	}
}

export const parser = new KeywordParser();
