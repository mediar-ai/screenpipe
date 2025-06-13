async function findAndClick(selector) {
	const button = await $(selector);
	await button.isClickable();
	await button.click();
}

module.exports = { findAndClick }; 