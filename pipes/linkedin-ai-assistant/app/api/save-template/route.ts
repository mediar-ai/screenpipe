import { NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

export async function POST(request: Request) {
    try {
        const template = await request.json();
        
        // Save to templates.json
        const templatePath = path.join(process.cwd(), 'lib', 'storage', 'templates.json');
        await fs.writeFile(templatePath, JSON.stringify(template, null, 2));
        
        console.log('template saved successfully');
        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('failed to save template:', error);
        return NextResponse.json(
            { error: String(error) },
            { status: 500 }
        );
    }
} 