"use strict";
"use server";
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
exports.default = generateRedditLinks;
function generateRedditLinks(content) {
    return __awaiter(this, void 0, void 0, function* () {
        const posts = content.split(/\[\d+\]/g).filter(Boolean);
        let result = "";
        posts.forEach((post, index) => {
            const titleMatch = post.match(/\[TITLE\](.*?)\[\/TITLE\]/s);
            const bodyMatch = post.match(/\[BODY\](.*?)\[\/BODY\]/s);
            const subredditsMatch = post.match(/\[r\/.*?\]/g);
            if (titleMatch && bodyMatch && subredditsMatch) {
                const title = titleMatch[1].trim();
                const body = bodyMatch[1].trim();
                // Truncate title and body if they're too long
                const maxTitleLength = 300; // Reddit's title limit
                const maxBodyLength = 40000; // Reddit's body limit
                const truncatedTitle = title.length > maxTitleLength
                    ? title.slice(0, maxTitleLength - 3) + "..."
                    : title;
                const truncatedBody = body.length > maxBodyLength
                    ? body.slice(0, maxBodyLength - 3) + "..."
                    : body;
                const encodedTitle = encodeURIComponent(truncatedTitle);
                const encodedBody = encodeURIComponent(`${truncatedTitle}\n\n${truncatedBody}`);
                result += `### ${index + 1}. ${title}\n\n${body}\n\n`;
                subredditsMatch.forEach((subreddit) => {
                    const subredditName = subreddit.slice(2, -1);
                    // Use a shorter URL format and handle potential URL length issues
                    try {
                        const link = `https://www.reddit.com/r/${subredditName}/submit?title=${encodedTitle}&text=${encodedBody}`;
                        result += `- ${subreddit} [SEND](${link})\n`;
                    }
                    catch (error) {
                        console.warn(`failed to generate link for post ${index + 1} in r/${subredditName}:`, error);
                        result += `- ${subreddit} [POST TOO LONG - COPY MANUALLY]\n`;
                    }
                });
                result += "\n";
            }
        });
        return result.trim();
    });
}
