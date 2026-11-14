function isEligibleUrl(url) {
  return typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"));
}

export function matchRuleForUrl(url, rules) {
  if (!isEligibleUrl(url)) {
    return null;
  }

  let winner = null;
  for (let index = 0; index < rules.length; index += 1) {
    const rule = rules[index];
    if (!rule.enabled || !url.startsWith(rule.prefix)) {
      continue;
    }
    if (!winner || rule.prefix.length > winner.rule.prefix.length) {
      winner = { rule, index };
    }
  }
  return winner;
}

export function matchTabs(tabs, rules) {
  return tabs.map((tab) => ({ tab, match: matchRuleForUrl(tab.url, rules) }));
}
