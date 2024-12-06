#!/usr/bin/env node

const https = require('https');
const http = require('http');

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4o';
const OPENAI_KEY = 'YOUR OPENAI KEY';

// DM @louis030195 if you want to use ollama instead, will help

// Function to make API calls
function callApi(url, data) {
    return new Promise((resolve, reject) => {
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_KEY}`
            }
        };

        const req = https.request(url, options, (res) => {
            let responseData = '';
            res.on('data', (chunk) => { responseData += chunk; });
            res.on('end', () => {
                resolve(JSON.parse(responseData));
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(JSON.stringify(data));
        req.end();
    });
}

// Function to make HTTP GET requests
function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve(data);
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

async function runScreenpipe(input) {
    // Generate query parameters
    const currentDate = new Date().toISOString();
    const paramsResponse = await callApi(OPENAI_API_URL, {
        messages: [
            {
                role: "user",
                content: `Based on this user selection: "${input}", generate parameters as JSON for 3 different queries to screenpipe. Each query should have "q", "offset", "limit", and start_time, end_time fields. Rules: - q should be a single keyword that would properly find in the text found on the user screen some information that would help answering the user question. Return a list of objects with the key "queries" - q contains a single query, again, for example instead of "life plan" just use "life" - Respond with only the updated JSON object - User's Date & time now is ${currentDate} - Make sure to respect user's date - Be concise, answer as a bullet list - Your answer will be read out loud so make sure it's adapted`
            }
        ],
        model: OPENAI_MODEL,
        response_format: { type: "json_object" }
    });

    // console.log("Raw API response:");
    // console.log(JSON.stringify(paramsResponse, null, 2));

    const queries = JSON.parse(paramsResponse.choices[0].message.content).queries;

    if (!queries) {
        console.error("Error: No queries returned from the API.");
        process.exit(1);
    }

    // Query screenpipe (replace with actual endpoint)
    const screenpipeResults = await Promise.all(queries.map(async (query) => {
        const { q, offset, limit } = query;
        return httpGet(`http://localhost:3030/search?q=${q}&offset=${offset}&limit=${limit}`);
    }));

    // Generate final response
    const finalResponse = await callApi(OPENAI_API_URL, {
        messages: [
            {
                role: "user",
                content: `Answer based on "${input}" and data: ${screenpipeResults.join(' ')}`
            }
        ],
        model: OPENAI_MODEL
    });

    console.log(finalResponse.choices[0].message.content);
}

// Run the function with input
const userInput = process.argv[2];
if (!userInput) {
    console.error("Please provide an input argument.");
    process.exit(1);
}

runScreenpipe(userInput).catch(console.error);