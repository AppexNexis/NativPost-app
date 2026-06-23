// Curated themes — each maps to an Unsplash search query
// The query is used server-side via /api/media-library/curated?theme=...
// Preview images are fetched live from Unsplash using the access key

export type CuratedTheme = {
  id: string;
  name: string;
  query: string; // Primary Unsplash search term
  fallbackQueries?: string[]; // Tried in order if primary returns no results
  previewUrl?: string; // optional static fallback
};

/**
 * Returns all queries for a theme (primary + fallbacks), in priority order.
 * Used by the unsplash-preview route to automatically retry on empty results.
 */
export function getThemeQueries(themeId: string): string[] {
  const theme = CURATED_THEMES.find((t) => t.id === themeId);
  if (!theme) return [];
  return [theme.query, ...(theme.fallbackQueries ?? [])];
}

export const CURATED_THEMES: CuratedTheme[] = [
  {
    id: 'artificial-intelligence',
    name: 'Artificial Intelligence',
    query: 'artificial intelligence technology',
    fallbackQueries: ['AI robot', 'machine learning', 'neural network', 'futuristic computer'],
  },
  {
    id: 'startup',
    name: 'Startup',
    query: 'startup office modern workspace',
    fallbackQueries: ['startup team', 'coworking office', 'modern office', 'tech office'],
  },
  {
    id: 'entrepreneurship',
    name: 'Entrepreneurship',
    query: 'entrepreneur hustle business growth',
    fallbackQueries: ['entrepreneur', 'business owner', 'startup founder', 'small business'],
  },
  {
    id: 'productivity',
    name: 'Productivity',
    query: 'productivity desk setup focus',
    fallbackQueries: ['desk workspace', 'focused work', 'organized desk', 'morning routine'],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    query: 'digital marketing strategy',
    fallbackQueries: ['marketing team', 'advertising campaign', 'brand strategy', 'marketing analytics'],
  },
  {
    id: 'social-media',
    name: 'Social Media',
    query: 'social media content creator',
    fallbackQueries: ['influencer phone', 'content creator', 'social media phone', 'instagram lifestyle'],
  },
  {
    id: 'finance',
    name: 'Finance',
    query: 'finance money investment banking',
    fallbackQueries: ['money finance', 'banking investment', 'financial charts', 'currency wealth'],
  },
  {
    id: 'investing',
    name: 'Investing',
    query: 'stock market investing wealth',
    fallbackQueries: ['stock market', 'investment portfolio', 'financial growth', 'trading charts'],
  },
  {
    id: 'business-growth',
    name: 'Business Growth',
    query: 'business growth success chart',
    fallbackQueries: ['business success', 'growth chart', 'corporate success', 'team achievement'],
  },
  {
    id: 'leadership',
    name: 'Leadership',
    query: 'leadership team meeting conference',
    fallbackQueries: ['business leader', 'team meeting', 'corporate leadership', 'CEO executive'],
  },
  {
    id: 'remote-work',
    name: 'Remote Work',
    query: 'remote work home office laptop',
    fallbackQueries: ['home office', 'work from home', 'laptop coffee', 'remote laptop'],
  },
  {
    id: 'technology',
    name: 'Technology',
    query: 'technology innovation digital future',
    fallbackQueries: ['tech innovation', 'digital technology', 'computer tech', 'future technology'],
  },
  {
    id: 'saas',
    name: 'SaaS',
    query: 'software dashboard app interface',
    fallbackQueries: ['software interface', 'app dashboard', 'tech product', 'UI design'],
  },
  {
    id: 'ecommerce',
    name: 'E-Commerce',
    query: 'ecommerce shopping online retail',
    fallbackQueries: ['online shopping', 'retail store', 'shopping bags', 'ecommerce store'],
  },
  {
    id: 'fitness',
    name: 'Fitness',
    query: 'fitness gym workout training',
    fallbackQueries: ['gym workout', 'exercise training', 'fitness athlete', 'running sport'],
  },
  {
    id: 'wellness',
    name: 'Wellness',
    query: 'wellness mindfulness meditation calm',
    fallbackQueries: ['meditation', 'mindfulness yoga', 'wellness spa', 'calm nature'],
  },
  {
    id: 'health',
    name: 'Health',
    query: 'health nutrition healthy lifestyle',
    fallbackQueries: ['healthy food', 'nutrition diet', 'healthy living', 'wellness health'],
  },
  {
    id: 'food',
    name: 'Food & Cooking',
    query: 'food cooking gourmet restaurant',
    fallbackQueries: ['gourmet food', 'cooking kitchen', 'restaurant meal', 'food photography'],
  },
  {
    id: 'travel',
    name: 'Travel',
    query: 'travel adventure explore world',
    fallbackQueries: ['travel destination', 'adventure explore', 'wanderlust journey', 'travel photography'],
  },
  {
    id: 'nature',
    name: 'Nature',
    query: 'nature landscape mountains forest',
    fallbackQueries: ['mountain landscape', 'forest nature', 'scenic landscape', 'wilderness nature'],
  },
  {
    id: 'luxury',
    name: 'Luxury',
    query: 'luxury lifestyle premium elegant',
    fallbackQueries: ['luxury lifestyle', 'premium elegant', 'high end luxury', 'affluent lifestyle'],
  },
  {
    id: 'real-estate',
    name: 'Real Estate',
    query: 'real estate property architecture modern home',
    fallbackQueries: ['modern home', 'luxury house', 'architecture property', 'interior design home'],
  },
  {
    id: 'education',
    name: 'Education',
    query: 'education learning books university',
    fallbackQueries: ['university campus', 'studying books', 'classroom learning', 'school education'],
  },
  {
    id: 'creativity',
    name: 'Creativity',
    query: 'creativity art design studio',
    fallbackQueries: ['creative studio', 'artist workspace', 'design creative', 'art workshop'],
  },
  {
    id: 'design',
    name: 'Design',
    query: 'graphic design typography branding',
    fallbackQueries: ['graphic design', 'branding design', 'typography layout', 'designer workspace'],
  },
  {
    id: 'photography',
    name: 'Photography',
    query: 'photography camera portrait studio',
    fallbackQueries: ['camera photography', 'portrait photographer', 'photo studio', 'photographer'],
  },
  {
    id: 'fashion',
    name: 'Fashion',
    query: 'fashion style clothing modern',
    fallbackQueries: ['fashion style', 'clothing boutique', 'street fashion', 'fashion model'],
  },
  {
    id: 'beauty',
    name: 'Beauty',
    query: 'beauty skincare makeup cosmetics',
    fallbackQueries: ['skincare beauty', 'makeup cosmetics', 'beauty routine', 'cosmetics product'],
  },
  {
    id: 'motivation',
    name: 'Motivation',
    query: 'motivation inspiration success mindset',
    fallbackQueries: ['inspiration motivation', 'success mindset', 'goal achievement', 'positive mindset'],
  },
  {
    id: 'minimalism',
    name: 'Minimalism',
    query: 'minimalism minimal clean simple aesthetic',
    fallbackQueries: ['minimal design', 'clean aesthetic', 'simple interior', 'minimalist lifestyle'],
  },
  {
    id: 'innovation',
    name: 'Innovation',
    query: 'innovation future technology breakthrough',
    fallbackQueries: ['tech innovation', 'breakthrough technology', 'future innovation', 'research development'],
  },
  {
    id: 'future-tech',
    name: 'Future Tech',
    query: 'futuristic technology cyberpunk neon',
    fallbackQueries: ['neon cyberpunk', 'futuristic city', 'sci-fi technology', 'digital future neon'],
  },
  {
    id: 'web-development',
    name: 'Web Development',
    query: 'web development coding programming',
    fallbackQueries: ['coding programmer', 'software development', 'developer laptop', 'programming code'],
  },
  {
    id: 'mobile-apps',
    name: 'Mobile Apps',
    query: 'mobile app smartphone interface ux',
    fallbackQueries: ['smartphone app', 'mobile UI', 'phone interface', 'app design'],
  },
  {
    id: 'personal-branding',
    name: 'Personal Branding',
    query: 'personal branding professional headshot',
    fallbackQueries: ['professional portrait', 'business headshot', 'personal brand', 'professional photo'],
  },
  {
    id: 'content-creation',
    name: 'Content Creation',
    query: 'camera filming creator',
    fallbackQueries: ['content creator', 'podcast recording', 'youtube creator', 'videography filming'],
  },
  {
    id: 'creator-economy',
    name: 'Creator Economy',
    query: 'influencer creator digital media',
    fallbackQueries: ['influencer lifestyle', 'digital creator', 'online creator', 'media content'],
  },
  {
    id: 'small-business',
    name: 'Small Business',
    query: 'small business local shop owner',
    fallbackQueries: ['local business', 'shop owner', 'small business owner', 'boutique store'],
  },
  {
    id: 'customer-success',
    name: 'Customer Success',
    query: 'customer service team support',
    fallbackQueries: ['customer support', 'service team', 'help desk', 'client success'],
  },
  {
    id: 'teamwork',
    name: 'Teamwork',
    query: 'teamwork collaboration office diverse',
    fallbackQueries: ['team collaboration', 'office teamwork', 'diverse team', 'group work'],
  },
  {
    id: 'community',
    name: 'Community',
    query: 'community people gathering social',
    fallbackQueries: ['community gathering', 'people together', 'social group', 'neighborhood community'],
  },
  {
    id: 'desk-setup',
    name: 'Desk Setup',
    query: 'desk setup workspace productivity aesthetic',
    fallbackQueries: ['desk workspace', 'home office setup', 'PC setup', 'aesthetic desk'],
  },
  {
    id: 'digital-nomad',
    name: 'Digital Nomad',
    query: 'remote work travel',
    fallbackQueries: ['travel laptop', 'coworking cafe', 'freelancer travel', 'work abroad'],
  },
  {
    id: 'cryptocurrency',
    name: 'Cryptocurrency',
    query: 'cryptocurrency bitcoin blockchain digital currency',
    fallbackQueries: ['bitcoin crypto', 'blockchain crypto', 'digital currency', 'crypto trading'],
  },
  {
    id: 'blockchain',
    name: 'Blockchain',
    query: 'blockchain decentralized network technology',
    fallbackQueries: ['blockchain technology', 'decentralized network', 'crypto blockchain', 'digital ledger'],
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity',
    query: 'cybersecurity hacker privacy data protection',
    fallbackQueries: ['cyber security', 'data privacy', 'hacker technology', 'digital security'],
  },
  {
    id: 'data-analytics',
    name: 'Data Analytics',
    query: 'data analytics charts dashboard visualization',
    fallbackQueries: ['data visualization', 'analytics dashboard', 'business charts', 'data science'],
  },
  {
    id: 'sustainability',
    name: 'Sustainability',
    query: 'sustainability green energy environment eco',
    fallbackQueries: ['green energy', 'eco environment', 'solar renewable', 'sustainable living'],
  },
  {
    id: 'mental-health',
    name: 'Mental Health',
    query: 'mental health therapy self care calm',
    fallbackQueries: ['therapy wellness', 'self care', 'mental wellness', 'calm mindfulness'],
  },
  {
    id: 'career-growth',
    name: 'Career Growth',
    query: 'career growth professional development promotion',
    fallbackQueries: ['professional growth', 'career development', 'job success', 'workplace achievement'],
  },
  {
    id: 'networking',
    name: 'Networking',
    query: 'networking business event conference handshake',
    fallbackQueries: ['business networking', 'professional conference', 'business handshake', 'corporate event'],
  },
  {
    id: 'airport-aesthetic',
    name: 'Airport Aesthetic',
    query: 'airport travel',
    fallbackQueries: ['airport terminal', 'airplane flight', 'travel boarding', 'flight travel'],
  },
  {
    id: 'animals',
    name: 'Animals',
    query: 'animals wildlife pets cute',
    fallbackQueries: ['wildlife animals', 'cute pets', 'nature animals', 'dog cat pet'],
  },
  {
    id: 'art',
    name: 'Art',
    query: 'art gallery painting contemporary museum',
    fallbackQueries: ['painting artwork', 'art museum', 'contemporary art', 'gallery exhibition'],
  },
  {
    id: 'gaming',
    name: 'Gaming',
    query: 'gaming esports video games setup neon',
    fallbackQueries: ['gaming setup', 'esports gamer', 'video game controller', 'gaming PC'],
  },
  {
    id: 'gym',
    name: 'Gym',
    query: 'gym weights exercise training bodybuilding',
    fallbackQueries: ['weight training', 'gym workout', 'bodybuilding fitness', 'strength training'],
  },
  {
    id: 'female-aesthetics',
    name: 'Female Aesthetics',
    query: 'female aesthetic lifestyle elegant woman',
    fallbackQueries: ['elegant woman', 'feminine lifestyle', 'woman aesthetic', 'stylish woman'],
  },
  {
    id: 'female-selfies',
    name: 'Female Selfies',
    query: 'woman portrait selfie lifestyle fashion',
    fallbackQueries: ['woman portrait', 'lifestyle portrait', 'fashion woman', 'woman fashion photo'],
  },
  {
    id: 'friendship',
    name: 'Friendship & Community',
    query: 'friends community group people laughing',
    fallbackQueries: ['friends laughing', 'group of friends', 'people together happy', 'social friendship'],
  },
  {
    id: 'generic-lifestyle',
    name: 'Generic Lifestyle',
    query: 'lifestyle everyday moments authentic living',
    fallbackQueries: ['everyday life', 'authentic lifestyle', 'candid moments', 'real life moments'],
  },
  {
    id: 'golf',
    name: 'Golf',
    query: 'golf course',
    fallbackQueries: ['golf player', 'golf sport', 'country club golf', 'golfer swing'],
  },
  {
    id: 'cars',
    name: 'Cars & Automotive',
    query: 'luxury car sports automotive road drive',
    fallbackQueries: ['sports car', 'luxury automobile', 'car driving', 'automotive vehicle'],
  },
  {
    id: 'coffee',
    name: 'Coffee Culture',
    query: 'coffee cafe barista latte aesthetic',
    fallbackQueries: ['coffee shop', 'barista coffee', 'cafe latte', 'coffee aesthetic'],
  },
  {
    id: 'books',
    name: 'Books & Knowledge',
    query: 'books reading library knowledge study',
    fallbackQueries: ['reading books', 'library study', 'bookshelf knowledge', 'book learning'],
  },
];