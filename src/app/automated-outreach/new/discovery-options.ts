/**
 * Suggested (not required — the inputs stay free-text via <datalist>, since
 * Nominatim/Overpass genuinely accept any real-world place name) options for
 * the campaign wizard's category/location fields.
 *
 * BUSINESS_CATEGORIES is deliberately the exact set of categories the
 * discovery backend has a REAL tag mapping for (see CATEGORY_TAGS in
 * overpass.lead-discovery.ts and CATEGORY_MAP in geoapify.lead-discovery.ts)
 * — picking one of these guarantees a real query against a real OpenStreetMap/
 * Geoapify tag, never the silent-zero-results fallback that free-typing
 * "Education" hit in production (it isn't a literal OSM tag; the unmapped
 * fallback queried shop=education/amenity=education, which matches nothing).
 */
export const BUSINESS_CATEGORIES = [
  "restaurant",
  "cafe",
  "bakery",
  "bar",
  "hotel",
  "dentist",
  "doctor",
  "clinic",
  "pharmacy",
  "veterinary",
  "gym",
  "spa",
  "salon",
  "lawyer",
  "accountant",
  "real estate",
  "plumber",
  "electrician",
  "auto repair",
  "education",
];

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut",
  "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa",
  "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan",
  "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire",
  "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia",
  "Wisconsin", "Wyoming",
];

const US_CITIES = [
  "New York, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX", "Phoenix, AZ",
  "Philadelphia, PA", "San Antonio, TX", "San Diego, CA", "Dallas, TX", "Austin, TX",
  "Jacksonville, FL", "San Jose, CA", "Fort Worth, TX", "Columbus, OH", "Charlotte, NC",
  "San Francisco, CA", "Indianapolis, IN", "Seattle, WA", "Denver, CO", "Washington, DC",
  "Boston, MA", "Nashville, TN", "El Paso, TX", "Detroit, MI", "Portland, OR",
  "Memphis, TN", "Las Vegas, NV", "Louisville, KY", "Baltimore, MD", "Milwaukee, WI",
  "Albuquerque, NM", "Tucson, AZ", "Fresno, CA", "Sacramento, CA", "Atlanta, GA",
  "Miami, FL", "Raleigh, NC", "Omaha, NE", "Minneapolis, MN", "Tampa, FL",
  "New Orleans, LA", "Cleveland, OH", "Orlando, FL", "Pittsburgh, PA", "Cincinnati, OH",
  "St. Louis, MO", "Kansas City, MO", "Salt Lake City, UT", "Richmond, VA",
];

const INDIA_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh", "Goa",
  "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka", "Kerala",
  "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland",
  "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana", "Tripura",
  "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir",
  "Ladakh", "Puducherry", "Chandigarh",
];

const INDIA_CITIES = [
  "Mumbai, Maharashtra", "Delhi", "Bengaluru, Karnataka", "Hyderabad, Telangana",
  "Ahmedabad, Gujarat", "Chennai, Tamil Nadu", "Kolkata, West Bengal", "Surat, Gujarat",
  "Pune, Maharashtra", "Jaipur, Rajasthan", "Lucknow, Uttar Pradesh", "Kanpur, Uttar Pradesh",
  "Nagpur, Maharashtra", "Indore, Madhya Pradesh", "Thane, Maharashtra",
  "Bhopal, Madhya Pradesh", "Visakhapatnam, Andhra Pradesh", "Patna, Bihar",
  "Vadodara, Gujarat", "Ghaziabad, Uttar Pradesh", "Ludhiana, Punjab", "Agra, Uttar Pradesh",
  "Nashik, Maharashtra", "Faridabad, Haryana", "Meerut, Uttar Pradesh",
  "Rajkot, Gujarat", "Kalyan, Maharashtra", "Vasai, Maharashtra", "Varanasi, Uttar Pradesh",
  "Srinagar, Jammu and Kashmir", "Aurangabad, Maharashtra", "Dhanbad, Jharkhand",
  "Amritsar, Punjab", "Navi Mumbai, Maharashtra", "Allahabad, Uttar Pradesh",
  "Ranchi, Jharkhand", "Coimbatore, Tamil Nadu", "Jabalpur, Madhya Pradesh",
  "Gwalior, Madhya Pradesh", "Vijayawada, Andhra Pradesh", "Chandigarh",
  "Guwahati, Assam", "Mysuru, Karnataka", "Kochi, Kerala", "Thiruvananthapuram, Kerala",
  "Noida, Uttar Pradesh", "Gurugram, Haryana",
];

// Delhi/Chandigarh are UTs that double as their own "main city" — de-duped
// rather than hand-maintaining two lists in sync.
export const LOCATION_OPTIONS = [
  ...new Set([...US_CITIES, ...INDIA_CITIES, ...US_STATES, ...INDIA_STATES]),
];
