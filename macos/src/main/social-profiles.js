const SOCIAL_PROFILES = Object.freeze({
  instagram: 'https://www.instagram.com/terencelam0903/',
  threads: 'https://www.threads.com/@terencelam0903'
});

function resolveSocialProfile(platform) {
  if (typeof platform !== 'string') return null;
  return SOCIAL_PROFILES[platform] || null;
}

module.exports = { SOCIAL_PROFILES, resolveSocialProfile };
