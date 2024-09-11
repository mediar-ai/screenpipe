import { FC } from "react";

import { CodeBlock } from "./ui/codeblock";

const ragExample = `
const searchScreenpipe = async (query) => {
  const response = await fetch(\`http://localhost:3030/search?q=\${encodeURIComponent(query)}&limit=10\`);
  return response.json();
};

const generateAnswer = async (question, context) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': \`Bearer \${process.env.OPENAI_API_KEY}\`,
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: \`Question: \${question}\nContext: \${JSON.stringify(context)}\` },
      ],
    }),
  });
  const data = await response.json();
  return data.choices[0].message.content;
};

const ragOverScreenpipe = async (question) => {
  const searchResults = await searchScreenpipe(question);
  return generateAnswer(question, searchResults);
};
`;

const RagExample: FC = () => {
  return (
    <div className="p-4 bg-gray-100 rounded-lg relative">
      <h3 className="text-lg font-semibold mb-2">
        Code to chat with your screenpipe data 👇
      </h3>
      <CodeBlock language="javascript" value={ragExample} />
    </div>
  );
};

export default RagExample;
