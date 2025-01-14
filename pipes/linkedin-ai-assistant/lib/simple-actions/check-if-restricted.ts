import { Page } from 'puppeteer-core';

export interface RestrictionInfo {
  isRestricted: boolean;
  restrictionEndDate?: string;
  reason?: string;
}

export async function checkIfRestricted(page: Page): Promise<RestrictionInfo> {
  // check url first as it's fastest
  const url = page.url();
  if (url.includes('checkpoint/challenge')) {
    console.log('restriction detected via url pattern');
    return extractRestrictionInfo(page);
  }

  // check for restriction message in content
  const content = await page.content();
  if (content.includes('your account is temporarily restricted')) {
    console.log('restriction detected via page content');
    return extractRestrictionInfo(page);
  }

  return { isRestricted: false };
}

async function extractRestrictionInfo(page: Page): Promise<RestrictionInfo> {
  try {
    // try to get the restriction message
    const messageEl = await page.$('section.rehabMessageScreen p');
    const message = await messageEl?.evaluate(el => el.textContent?.trim()) || '';

    // try to extract date
    const dateMatch = message.match(/until (.*?) PST/);
    const restrictionEndDate = dateMatch ? new Date(dateMatch[1]).toISOString() : undefined;

    return {
      isRestricted: true,
      restrictionEndDate,
      reason: message
    };
  } catch (error) {
    console.log('error extracting restriction details:', error);
    return { isRestricted: true };
  }
}

// usage example:
/*
async function someLinkedInOperation(page: Page) {
  const restrictionStatus = await checkIfRestricted(page);
  if (restrictionStatus.isRestricted) {
    console.log('account restricted until:', restrictionStatus.restrictionEndDate);
    throw new Error('linkedin account is restricted');
  }
  
  // continue with normal operation
}
*/ 