// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
// Main-app browser mock; fictional documents and no external sends.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.LIBRARY_APP_URL || 'http://127.0.0.1:1420';
const out = process.env.LIBRARY_SCREENSHOTS || '/tmp/library-editor';
const baseline = process.env.LIBRARY_BASELINE === '1';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(30000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    if (!localStorage.getItem('library-eval-seeded')) {
      localStorage.setItem('library-eval-seeded', '1');
      localStorage.setItem('workflow-skill-preview', JSON.stringify([{workflowKey:'research-synthesis',draft:{name:'research-synthesis',description:'Use when turning several sources into a traceable research brief.',instructions:'## 1. Collect sources\n\nRead the source documents and keep **direct references** for each finding.\n\n- Separate facts from assumptions.\n- Preserve conflicting evidence.\n\n## 2. Review the brief\n\nSummarize the findings, link their sources, and list open questions.\n\n> Ask the owner to review before sharing.',sourceWorkflow:'Research synthesis'}}]));
    }
  });
  const snap = async name => { console.log('Capture', name, 'fonts:', await page.evaluate(() => document.fonts.status)); return page.screenshot({ path: `${out}/${name}.png`, animations: 'disabled', style: 'nextjs-portal { display: none; }', timeout: 15000 }); };
  async function dismiss() {
    await page.getByRole('button', { name: 'Do later', exact: true }).click({ timeout: 15000 }).catch(() => {});
    const minimize = page.getByRole('button', {name:'Minimize chat', exact:true});
    if (await minimize.isVisible()) await minimize.click();
  }
  try {
    await page.goto(base+'/home?mode=workflows&view=library&libraryTab=skills&libraryItem=research-synthesis', {timeout:120000});
    await (baseline ? page.locator("label").filter({hasText:"Instructions"}).locator("textarea") : page.getByLabel("Instructions", {exact:true})).waitFor();
    await dismiss();
    const instructions = baseline ? page.locator('label').filter({hasText:'Instructions'}).locator('textarea') : page.getByRole('textbox', {name:'Instructions', exact:true});
    await instructions.waitFor();
    assert.equal(await instructions.getAttribute('contenteditable'), baseline ? null : 'true');
    await snap(baseline ? 'skill-before' : 'skill-after');
    if (!baseline) {
      assert.equal(await instructions.getAttribute('contenteditable'), 'true');
      await page.getByRole('toolbar', {name:'Instructions formatting'}).getByRole('button', {name:'Paragraph',exact:true}).waitFor();
      await page.getByRole('button', {name:'Share', exact:true}).click();
      await page.getByRole('dialog').waitFor();
      await snap('skill-share');
      await page.keyboard.press('Escape');
      await instructions.fill('A reviewed research brief');
      await instructions.press('ControlOrMeta+a');
      await page.getByRole('toolbar', {name:'Instructions formatting'}).getByRole('button',{name:'Bold',exact:true}).click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('workflow-skill-preview'))[0].draft.instructions.includes('**A reviewed research brief**'));
      await page.reload(); await dismiss();
      assert.equal(await instructions.locator('strong').innerText(), 'A reviewed research brief');
      await page.getByLabel('Skill actions',{exact:true}).click();
      const download = page.waitForEvent('download');
      await page.getByRole('button',{name:'Download SKILL.md',exact:true}).click();
      assert.equal((await download).suggestedFilename(),'SKILL.md');
      await page.setViewportSize({width:900,height:800});
      await snap('skill-compact');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth > innerWidth),false);
      await page.setViewportSize({width:1440,height:1000});
    }
    await page.getByRole('button',{name:/^Home/}).click();
    await page.getByRole('button',{name:'Open map',exact:true}).first().click();
    await page.getByRole("button", { name: "More workflow actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Create SOP", exact: true }).click();
    await page.getByRole('textbox',{name:'SOP title',exact:true}).waitFor();
    await dismiss();
    await snap(baseline ? 'recipe-before' : 'recipe-after');
    if (!baseline) {
      await page.getByRole('button',{name:'Share',exact:true}).click();
      await page.getByRole('dialog').waitFor();
      await snap('recipe-share');
      await page.keyboard.press('Escape');
      await page.getByRole('button',{name:'Video SOP',exact:true}).click();
      await page.getByRole('region',{name:'Video SOP',exact:true}).waitFor();
      await snap('recipe-video');
      await page.getByRole('button',{name:'Back to SOP',exact:true}).click();
      await page.getByRole('group', {name: 'Switch workspace', exact: true}).getByRole('button', {name: 'Memory', exact: true}).click();
      await page.getByRole('group', {name: 'Switch workspace', exact: true}).getByRole('button', {name: 'Workflows', exact: true}).click();
      await page.getByRole('textbox',{name:'SOP title',exact:true}).waitFor();
    }
    assert.deepEqual(errors,[]);
    console.log(baseline ? 'PASS: recreated baseline captured' : 'PASS: integrated skill/recipe editor, formatting persistence, download, explicit share review, video entry, compact layout, Memory/Workflows switching');
  } catch (e) { console.error(e); console.error((await page.locator('body').innerText()).slice(-6000)); await snap('failure'); throw e; }
  finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1)});
