export default async function handler(req, res) {
  const { slug = [] } = req.query;
  const path = slug.join('/');
  const match = path.match(/^\d+_(.+)\.ico$/);
  if (!match) return res.status(400).send('Invalid format');

  const encoded = match[1];
  try {
    const json = decodeURIComponent(escape(atob(encoded)));
    const data = JSON.parse(json);
    console.log('✅ Payload received:', data);
    res.setHeader('Content-Type', 'image/x-icon');
    res.status(200).send('');
  } catch (e) {
    console.error('❌ Decode error:', e.message);
    res.status(400).send('Bad payload');
  }
}
