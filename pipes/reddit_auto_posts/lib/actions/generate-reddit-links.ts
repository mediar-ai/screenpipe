"use server";

export default async function generateRedditLinks(content: string): Promise<string> {
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
        } catch (error) {
          console.warn(`failed to generate link for post ${index + 1} in r/${subredditName}:`, error);
          result += `- ${subreddit} [POST TOO LONG - COPY MANUALLY]\n`;
        }
      });

      result += "\n";
    }
  });

  return result.trim();
}
