# pipe-knowledge-graph-builder

![Screenpipe Pipe Store json](https://github.com/user-attachments/assets/6c074beb-5b0f-4829-8a07-52805a78e80c)

## overview

the pipe-knowledge-graph-builder is an experimental pipe for screenpipe that builds a knowledge graph based on your screen activities. it uses ollama with the phi3.5 model to analyze your screen data and extract key topics and their relationships.

## how it works

1. every 30 minutes, the pipe queries screenpipe for recent screen data.
2. it then uses ollama with phi3.5 to analyze this data and extract main topics and subtopics.
3. the ai generates a knowledge graph structure representing these topics and their relationships.
4. the graph data is integrated into an existing knowledge graph, which is persisted to a file.
5. you receive a notification about the update to your knowledge graph.

## features

- persistent knowledge graph: the graph is saved to and loaded from a file (`knowledgeGraph.json`), allowing it to grow over time.
- incremental updates: new topics and relationships are added to the existing graph without duplicates.
- console logging: updates to the graph are logged, showing new nodes and edges added.

## setup and running

to use this pipe:

1. ensure you have ollama installed and running:

```bash
ollama run phi3.5
```

2. add the url of this pipe in the screenpipe app input and click "add" to install:

```
https://github.com/mediar-ai/screenpipe/tree/main/examples/typescript/pipe-knowledge-graph-builder
```

3. the pipe will start running automatically, analyzing your screen data every 30 minutes.

## output

the pipe generates and maintains a `knowledgeGraph.json` file, which contains the current state of your knowledge graph. this file includes:

- nodes: representing topics and concepts
- edges: representing relationships between nodes

the structure of this file is compatible with many graph visualization libraries, allowing for easy future integration with visualization tools.

## current limitations

- the graph is stored as a json file, which may become inefficient for very large graphs.
- there's no built-in visualization of the graph structure.

## future improvements

- integrate with a graph database like neo4j for more efficient storage and querying.
- add a visualization component using a library like vis.js or d3.js.
- implement more sophisticated topic extraction and relationship analysis.
- allow user queries against the knowledge graph for insights into their activities and interests.
- optimize the graph update process for larger datasets.

## using the output

the `knowledgeGraph.json` file can be used with various visualization libraries. for example, with vis.js:

```javascript
// assuming you've loaded the json file into a variable called graphdata
const nodes = new vis.dataset(graphdata.nodes);
const edges = new vis.dataset(graphdata.edges.map(edge => ({
    from: edge.split('-')[0],
    to: edge.split('-')[1],
    label: edge.split('-')[2]
})));

const container = document.getelementbyid('mynetwork');
const data = { nodes, edges };
const options = {};
const network = new vis.network(container, data, options);
```

this would create a visual representation of your knowledge graph, allowing you to explore the connections between topics and concepts derived from your screen activities.