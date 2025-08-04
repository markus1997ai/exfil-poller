export default async function handler(req, res) {
  const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
  if (!GITHUB_TOKEN) {
    return res.status(500).json({ error: 'Missing GITHUB_TOKEN environment variable' });
  }

  const owner = 'markus1997ai';
  const repo = 'store';

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/traffic/popular/paths`;
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `token ${GITHUB_TOKEN}`,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    return res.status(500).json({ error: 'GitHub API error', details: text });
  }

  const data = await response.json();

  // Just return the result for now
  return res.status(200).json(data);
}
