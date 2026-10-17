import { IconicProject } from '../models/project.model';

export const EGYPT_PROJECTS: IconicProject[] = [
  {
    id: 'iconic-tower',
    name: 'The Iconic Tower',
    subtitle: 'New Administrative Capital',
    region: 'egypt',
    country: 'Egypt',
    countryCode: 'eg',
    coordinates: { lat: 30.0194, lng: 31.7605 },
    heroImage: 'assets/projects/iconic.jpg',
    engineeringHighlight:
      'High-performance, low-carbon concrete designed for the load demands of a 78-storey tower.',
    description:
      'Rising 385 meters above Egypt\'s New Administrative Capital, the Iconic Tower is the tallest building in Africa and a beacon of modern Egyptian ambition. Holcim\'s high-performance, low-carbon concrete solutions were instrumental in delivering the structural integrity required for this supertall skyscraper. The tower employs advanced ECOPlanet cement formulations that reduce embodied carbon while meeting the extreme load-bearing demands of a 78-storey structure. This landmark project demonstrates that sustainable construction and architectural ambition are not mutually exclusive — they are inseparable.',
    stats: {
      height: '385m',
      co2Reduction: '30%',
      customStats: [
        { label: 'Floors', value: '78', icon: 'layers-outline' },
        { label: 'Status', value: 'Tallest in Africa', icon: 'trophy-outline' },
      ],
    },
    products: [
      { name: 'ECOPlanet', percentage: 'Low-carbon cement', color: '#2E7D32' },
      { name: 'High-Performance Concrete', description: 'Supertall-grade mix design', color: '#1565C0' },
    ],
    tags: ['Low-Carbon', 'Supertall', 'Smart Infrastructure'],
    order: 1,
  },
  {
    id: 'grand-egyptian-museum',
    name: 'Grand Egyptian Museum',
    subtitle: 'Giza Plateau',
    region: 'egypt',
    country: 'Egypt',
    countryCode: 'eg',
    coordinates: { lat: 29.9946, lng: 31.1171 },
    heroImage: 'assets/projects/grand_museum.webp',
    engineeringHighlight:
      'Sustainable concrete solutions for construction beside the Giza Plateau heritage zone.',
    description:
      'The Grand Egyptian Museum (GEM) is the largest archaeological museum in the world, located just two kilometres from the Great Pyramids of Giza. Spanning 490,000 square metres, the museum houses over 100,000 artefacts, including the complete Tutankhamun collection. Holcim provided sustainable concrete solutions designed to meet stringent heritage-zone construction requirements while minimising environmental impact on the surrounding plateau. The project stands as a case study in how modern construction can serve cultural preservation — protecting the past while building for the future.',
    stats: {
      concreteVolume: '490K m²',
      co2Reduction: '25%',
      customStats: [
        { label: 'Artefacts', value: '100,000+', icon: 'diamond-outline' },
        { label: 'Opened', value: '2024', icon: 'calendar-outline' },
      ],
    },
    products: [
      { name: 'Sustainable Concrete', percentage: 'Heritage-grade solutions', color: '#E65100' },
      { name: 'ECOPlanet', percentage: 'Reduced embodied carbon', color: '#2E7D32' },
    ],
    tags: ['Heritage', 'Sustainability', 'World-Class'],
    order: 2,
  },
  {
    id: 'alamein-towers',
    name: 'Alamein Towers',
    subtitle: 'New Alamein City',
    region: 'egypt',
    country: 'Egypt',
    countryCode: 'eg',
    coordinates: { lat: 30.8387, lng: 28.9543 },
    heroImage: 'assets/projects/alamein_towers.webp',
    engineeringHighlight:
      'Low-carbon concrete designed for durable construction in coastal and marine conditions.',
    description:
      'The Alamein Towers are the centrepiece of Egypt\'s ambitious New Alamein coastal city on the Mediterranean. These striking residential and hospitality towers showcase Holcim\'s ECOPlanet low-carbon cement, reducing the carbon footprint of a new city rising from the ground up. The towers demonstrate that coastal developments — where concrete faces salt exposure, humidity and marine conditions — can be built sustainably without compromising durability. ECOPlanet\'s formulation reduces CO₂ emissions by up to 40% compared to ordinary Portland cement.',
    stats: {
      co2Reduction: '40%',
      customStats: [
        { label: 'Towers', value: 'Multiple', icon: 'business-outline' },
        { label: 'Setting', value: 'Mediterranean Coast', icon: 'water-outline' },
      ],
    },
    products: [
      { name: 'ECOPlanet', percentage: '40% less CO₂', color: '#2E7D32' },
    ],
    tags: ['Low-Carbon', 'Coastal', 'Smart City'],
    order: 3,
  },
  {
    id: 'sokhna-port',
    name: 'Ain El-Sokhna Port',
    subtitle: 'Port Expansion Project',
    region: 'egypt',
    country: 'Egypt',
    countryCode: 'eg',
    coordinates: { lat: 29.5833, lng: 32.3167 },
    heroImage: 'assets/projects/sokhna_port.webp',
    engineeringHighlight:
      'Low-carbon concrete for heavy-duty quay walls, breakwaters and logistics infrastructure.',
    description:
      'The Al-Ain El-Sokhna Port expansion is one of Egypt\'s most critical infrastructure projects, strengthening the country\'s position as a global logistics hub on the Red Sea. This deep-dive infrastructure project achieved a remarkable 45% CO₂ reduction using Holcim\'s ECOPlanet cement — a benchmark for sustainable port construction worldwide. The expansion involved massive concrete pours for quay walls, breakwaters and logistics zones, all executed with low-carbon formulations that maintained the structural performance required for heavy-duty maritime infrastructure.',
    stats: {
      co2Reduction: '45%',
      customStats: [
        { label: 'Infrastructure', value: 'Port & Logistics', icon: 'boat-outline' },
        { label: 'Impact', value: 'Global Benchmark', icon: 'earth-outline' },
      ],
    },
    products: [
      { name: 'ECOPlanet', percentage: '45% CO₂ reduction', color: '#2E7D32' },
    ],
    tags: ['Infrastructure', 'Low-Carbon', 'Maritime'],
    order: 4,
  },
];

export const AMEA_PROJECTS: IconicProject[] = [
  {
    id: 'mohammed-vi-tower',
    name: 'Mohammed VI Tower',
    subtitle: 'Rabat, Morocco',
    region: 'amea',
    country: 'Morocco',
    countryCode: 'ma',
    coordinates: { lat: 33.9716, lng: -6.8498 },
    mapPosition: { x: 22, y: 32 },
    heroImage: 'assets/projects/mohammed_vi_tower.webp',
    engineeringHighlight:
      'ECOPact low-carbon concrete supporting supertall construction in the Bouregreg Valley.',
    description:
      'The Mohammed VI Tower in Rabat will stand as one of Africa\'s tallest structures upon completion, reshaping the Moroccan capital\'s skyline. Holcim\'s ECOPact low-carbon concrete is a key enabler for this monumental project, demonstrating that supertall ambitions and sustainability commitments can coexist. The tower\'s construction pushes the boundaries of what green concrete can achieve at scale.',
    stats: {
      height: '250m+',
      co2Reduction: '35%',
      customStats: [
        { label: 'Location', value: 'Bouregreg Valley', icon: 'location-outline' },
      ],
    },
    products: [
      { name: 'ECOPact', percentage: 'Low-carbon concrete', color: '#00897B' },
    ],
    tags: ['Supertall', 'Low-Carbon', 'Landmark'],
    order: 1,
  },
  {
    id: 'ebimpe-stadium',
    name: 'Ebimpé Olympic Stadium',
    subtitle: 'Abidjan, Ivory Coast',
    region: 'amea',
    country: 'Ivory Coast',
    countryCode: 'ci',
    coordinates: { lat: 5.4214, lng: -3.8967 },
    mapPosition: { x: 24, y: 55 },
    heroImage: 'assets/projects/ebimpe_stadium.webp',
    engineeringHighlight:
      'Low-carbon cement in the stadium seating structure and sweeping roof canopy.',
    description:
      'The Stade Olympique d\'Ebimpé is the crown jewel of Ivory Coast\'s sporting infrastructure, with a capacity of 60,000 seats. Built for the 2023 Africa Cup of Nations, this world-class stadium used Holcim\'s ECOPlanet cement to reduce the carbon footprint of its massive concrete structures — from the sweeping roof canopy to the terraced seating bowls. The project proves that sustainable building materials can meet the exacting standards of international sporting venues.',
    stats: {
      concreteVolume: '60,000 seats',
      co2Reduction: '30%',
      customStats: [
        { label: 'Event', value: 'AFCON 2023', icon: 'football-outline' },
      ],
    },
    products: [
      { name: 'ECOPlanet', percentage: '30% less CO₂', color: '#2E7D32' },
    ],
    tags: ['Sports', 'Low-Carbon', 'World-Class'],
    order: 2,
  },
  {
    id: 'melbourne-metro',
    name: 'Melbourne Metro Tunnel',
    subtitle: 'Melbourne, Australia',
    region: 'amea',
    country: 'Australia',
    countryCode: 'au',
    coordinates: { lat: -37.8136, lng: 144.9631 },
    mapPosition: { x: 82, y: 82 },
    heroImage: 'assets/projects/melbourne_metro.webp',
    engineeringHighlight:
      'Low-carbon concrete for tunnel lining segments and five underground stations.',
    description:
      'The Melbourne Metro Tunnel is a transformative urban infrastructure project featuring 9 kilometres of twin tunnels beneath the city centre, five new underground stations, and a complete reimagining of Melbourne\'s rail network. Holcim supplied ECOPact and ECOPlanet solutions for the tunnel lining segments and station structures, achieving significant carbon reductions across hundreds of thousands of cubic metres of concrete. This project exemplifies how sustainable construction can drive the next generation of urban mobility.',
    stats: {
      co2Reduction: '35%',
      customStats: [
        { label: 'Tunnels', value: '9 km twin', icon: 'train-outline' },
        { label: 'Stations', value: '5 new', icon: 'navigate-outline' },
      ],
    },
    products: [
      { name: 'ECOPact', percentage: 'Low-carbon ready-mix', color: '#00897B' },
      { name: 'ECOPlanet', percentage: 'Tunnel segments', color: '#2E7D32' },
    ],
    tags: ['Infrastructure', 'Urban Mobility', 'Low-Carbon'],
    order: 3,
  },
  {
    id: 'casa-anfa',
    name: 'Casa Anfa',
    subtitle: 'Casablanca, Morocco',
    region: 'amea',
    country: 'Morocco',
    countryCode: 'ma',
    coordinates: { lat: 33.5731, lng: -7.5898 },
    mapPosition: { x: 20, y: 35 },
    heroImage: 'assets/projects/casa_anfa.webp',
    engineeringHighlight:
      'Low-carbon cement supporting a mixed-use district with buildings, public spaces and parks.',
    description:
      'Casa Anfa is a visionary mixed-use urban development on the site of the former Anfa airport in Casablanca. Spanning residential towers, commercial spaces, parks and cultural venues, this smart city project uses Holcim\'s ECOPlanet cement throughout its construction. Casa Anfa represents the future of sustainable urban living in Africa — a masterplanned community built on low-carbon foundations.',
    stats: {
      co2Reduction: '30%',
      customStats: [
        { label: 'Type', value: 'Smart City', icon: 'grid-outline' },
        { label: 'Scale', value: 'Citywide', icon: 'resize-outline' },
      ],
    },
    products: [
      { name: 'ECOPlanet', percentage: 'Low-carbon cement', color: '#2E7D32' },
    ],
    tags: ['Smart City', 'Mixed-Use', 'Low-Carbon'],
    order: 4,
  },
];

export const ALL_PROJECTS: IconicProject[] = [...EGYPT_PROJECTS, ...AMEA_PROJECTS];
