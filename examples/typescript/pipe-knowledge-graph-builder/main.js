const INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds

async function queryScreenpipe(params) {
    try {
        const queryParams = Object.entries(params)
            .filter(([_, v]) => v != null)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
            .join('&');
        console.log("calling screenpipe", JSON.stringify(params));
        const result = await pipe.get(`http://localhost:3030/search?${queryParams}`);
        console.log("got", result.data.length, "items from screenpipe");
        return result;
    } catch (error) {
        console.error("error querying screenpipe:", error);
        return null;
    }
}

async function getAIProvider() {
    const provider = "ollama";
    const model = "phi3.5";
    return { provider, model };
}

async function extractTopics(provider, screenData) {
    const prompt = `analyze the following screen data to extract main topics and concepts:
    ${JSON.stringify(screenData)}
    identify key topics, subtopics, and their relationships.
    return a JSON object representing a knowledge graph with the following structure:
    {
        "nodes": [
            { "id": "topic1", "label": "Topic 1" },
            { "id": "subtopic1", "label": "Subtopic 1" }
        ],
        "edges": [
            { "from": "topic1", "to": "subtopic1", "label": "contains" }
        ]
    }
    limit the response to 10 main topics and their related subtopics.
    do not say anything else but JSON.`;

    const result = await pipe.post(
        "http://localhost:11434/api/chat",
        JSON.stringify({
            model: provider.model,
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" },
            stream: false,
        }),
    );
    console.log("ai analysis:", result);
    const content = result.message.content;
    return JSON.parse(content);
}

// async function updateKnowledgeGraph(graphData) {
//     // this function would update a persistent knowledge graph
//     // for this example, we'll just log the data
//     console.log("knowledge graph update:", graphData);
//     // in a real implementation, you might use a graph database like neo4j
//     // or a visualization library like vis.js to maintain and display the graph
// }

let knowledgeGraph = {
    nodes: new Map(),
    edges: new Set()
};

// Function to load the knowledge graph from file if it exists
function loadKnowledgeGraph() {
    try {
        if (fs.existsSync('knowledgeGraph.json')) {
            const data = fs.readFileSync('knowledgeGraph.json', 'utf8');
            const parsedData = JSON.parse(data);
            knowledgeGraph.nodes = new Map(parsedData.nodes.map(node => [node.id, node]));
            knowledgeGraph.edges = new Set(parsedData.edges);
            console.log('Loaded existing knowledge graph from file');
        } else {
            console.log('No existing knowledge graph file found. Starting with an empty graph.');
        }
    } catch (error) {
        console.error('Error loading knowledge graph:', error);
        console.log('Starting with an empty graph.');
    }
}

function updateKnowledgeGraph(graphData) {
    console.log("Knowledge Graph Update:", graphData);

    // Update nodes
    graphData.nodes.forEach(node => {
        if (!knowledgeGraph.nodes.has(node.id)) {
            knowledgeGraph.nodes.set(node.id, node);
            console.log(`Added new node: ${node.id} - ${node.label}`);
        }
    });

    // Update edges
    graphData.edges.forEach(edge => {
        const edgeKey = `${edge.from}-${edge.to}-${edge.label}`;
        if (!knowledgeGraph.edges.has(edgeKey)) {
            knowledgeGraph.edges.add(edgeKey);
            console.log(`Added new edge: ${edge.from} -> ${edge.to} (${edge.label})`);
        }
    });

    // Log current state of the graph
    console.log("Current Knowledge Graph State:");
    console.log("Nodes:", knowledgeGraph.nodes.size);
    console.log("Edges:", knowledgeGraph.edges.size);

    // Persist the updated knowledge graph to a file
    try {
        fs.writeFileSync('knowledgeGraph.json', JSON.stringify({
            nodes: Array.from(knowledgeGraph.nodes.values()),
            edges: Array.from(knowledgeGraph.edges)
        }, null, 2));
        console.log('Knowledge graph successfully saved to file');
    } catch (error) {
        console.error('Error saving knowledge graph to file:', error);
    }
}

async function main() {
    loadKnowledgeGraph();
    const provider = await getAIProvider();
    while (true) {
        try {
            const screenData = await queryScreenpipe({
                limit: 200,
                offset: 0,
                start_time: new Date(Date.now() - INTERVAL).toISOString(),
                end_time: new Date().toISOString(),
                content_type: "ocr",
            });
            if (screenData && screenData.data) {
                const topicsGraph = await extractTopics(provider, screenData.data);
                await updateKnowledgeGraph(topicsGraph);
                
                pipe.sendNotification({
                    title: "knowledge graph updated",
                    body: `added ${topicsGraph.nodes.length} new topics to your knowledge graph.`,
                });
            }
        } catch (error) {
            console.error("error in main loop:", error);
        }
        await new Promise(resolve => setTimeout(resolve, INTERVAL));
    }
}

main();