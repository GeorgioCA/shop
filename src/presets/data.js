// Industry presets. Each one is ordinary configuration + seed content: there is
// no "restaurant mode" in the application, only rows written by these objects.
//
// Section fields follow src/content/sections.js. Anything omitted takes the
// section's default, so the data stays readable.

const T = {
  modern: { preset: "modern", primary: "#1f5c4a", primaryText: "#ffffff", accent: "#d97706", background: "#fbfaf7", surface: "#ffffff", text: "#1c1917", muted: "#6b6560", border: "#e7e2d9", headingFont: "serif", bodyFont: "sans", radius: "soft" },
  bold: { preset: "bold", primary: "#9f1239", primaryText: "#ffffff", accent: "#f59e0b", background: "#fffbf7", surface: "#ffffff", text: "#1c1917", muted: "#6b6560", border: "#f0e0d6", headingFont: "sans", bodyFont: "sans", radius: "round" },
  minimal: { preset: "minimal", primary: "#111827", primaryText: "#ffffff", accent: "#2563eb", background: "#fafafa", surface: "#ffffff", text: "#111827", muted: "#6b7280", border: "#e5e7eb", headingFont: "sans", bodyFont: "sans", radius: "sharp" },
  warm: { preset: "warm", primary: "#7c3f21", primaryText: "#ffffff", accent: "#c2410c", background: "#fdf8f3", surface: "#ffffff", text: "#2b1c14", muted: "#7a6357", border: "#ecdfd2", headingFont: "serif", bodyFont: "sans", radius: "soft" },
  coastal: { preset: "coastal", primary: "#0e7490", primaryText: "#ffffff", accent: "#f59e0b", background: "#f7fbfc", surface: "#ffffff", text: "#0f2b33", muted: "#5b7480", border: "#d9e8ed", headingFont: "sans", bodyFont: "sans", radius: "soft" },
  luxe: { preset: "luxe", primary: "#1e293b", primaryText: "#ffffff", accent: "#b08d57", background: "#f8f6f2", surface: "#ffffff", text: "#1a1a1a", muted: "#6f6a60", border: "#e6e0d4", headingFont: "serif", bodyFont: "sans", radius: "sharp" }
};

const HOURS = {
  retail: { mon: { closed: false, open: "10:00", close: "18:00" }, tue: { closed: false, open: "10:00", close: "18:00" }, wed: { closed: false, open: "10:00", close: "18:00" }, thu: { closed: false, open: "10:00", close: "20:00" }, fri: { closed: false, open: "10:00", close: "20:00" }, sat: { closed: false, open: "10:00", close: "17:00" }, sun: { closed: true, open: "11:00", close: "16:00" } },
  office: { mon: { closed: false, open: "08:30", close: "17:00" }, tue: { closed: false, open: "08:30", close: "17:00" }, wed: { closed: false, open: "08:30", close: "17:00" }, thu: { closed: false, open: "08:30", close: "17:00" }, fri: { closed: false, open: "08:30", close: "16:00" }, sat: { closed: true, open: "09:00", close: "13:00" }, sun: { closed: true, open: "09:00", close: "13:00" } },
  food: { mon: { closed: true, open: "11:00", close: "21:00" }, tue: { closed: false, open: "11:00", close: "21:00" }, wed: { closed: false, open: "11:00", close: "21:00" }, thu: { closed: false, open: "11:00", close: "22:00" }, fri: { closed: false, open: "11:00", close: "23:00" }, sat: { closed: false, open: "10:00", close: "23:00" }, sun: { closed: false, open: "10:00", close: "20:00" } },
  cafe: { mon: { closed: false, open: "07:00", close: "16:00" }, tue: { closed: false, open: "07:00", close: "16:00" }, wed: { closed: false, open: "07:00", close: "16:00" }, thu: { closed: false, open: "07:00", close: "17:00" }, fri: { closed: false, open: "07:00", close: "17:00" }, sat: { closed: false, open: "08:00", close: "17:00" }, sun: { closed: false, open: "08:00", close: "15:00" } },
  shop: { mon: { closed: false, open: "08:00", close: "17:30" }, tue: { closed: false, open: "08:00", close: "17:30" }, wed: { closed: false, open: "08:00", close: "17:30" }, thu: { closed: false, open: "08:00", close: "17:30" }, fri: { closed: false, open: "08:00", close: "17:30" }, sat: { closed: false, open: "09:00", close: "14:00" }, sun: { closed: true, open: "09:00", close: "14:00" } }
};

const nav = (...links) => links.map(([label, url], i) => ({ label, url, location: "header", sort: (i + 1) * 10, visible: 1 }));

const base = (name, over = {}) => ({
  business: {
    name,
    tagline: over.tagline || "",
    description: over.description || "",
    category: over.category || "",
    email: over.email || `hello@${name.toLowerCase().replace(/[^a-z0-9]+/g, "")}.example`,
    city: "Calgary",
    region: "Alberta",
    country: "Canada",
    timezone: "America/Edmonton",
    currency: "CAD",
    locale: "en-CA"
  },
  theme: over.theme || T.modern,
  hours: over.hours || HOURS.office,
  modules: over.modules || ["content", "catalog", "commerce", "inquiries"],
  nav: over.nav || nav(["Home", "/"], ["Shop", "/shop"], ["Contact", "/contact"]),
  catalog: over.catalog || { productsLabel: "Products", productSingular: "Product", servicesLabel: "Services", serviceSingular: "Service" },
  commerce: over.commerce || {},
  bookings: over.bookings || {},
  site: over.site || {},
  home: over.home || [],
  pages: over.pages || [],
  categories: over.categories || [],
  products: over.products || [],
  services: over.services || [],
  faqs: over.faqs || [],
  testimonials: over.testimonials || []
});

const P = (name, price, desc, category, extra = {}) => ({ name, price, desc, category, ...extra });
const S = (name, price, duration, desc, category, extra = {}) => ({ name, price, duration, desc, category, ...extra });

export const PRESETS = {
  /* ------------------------------- Food ---------------------------------- */
  restaurant: base("Juniper Kitchen", {
    tagline: "Seasonal plates, wood fire, no fuss.",
    description: "A neighbourhood kitchen serving a short, changing menu of wood-fired plates, fresh pasta and local produce.",
    category: "Restaurant",
    theme: T.warm,
    hours: HOURS.food,
    modules: ["content", "catalog", "commerce", "delivery", "promotions", "inventory", "inquiries", "newsletter", "reviews"],
    catalog: { productsLabel: "Menu", productSingular: "Dish", servicesLabel: "Services", serviceSingular: "Service" },
    commerce: { pickupEnabled: 1, deliveryEnabled: 1, deliveryFeeCents: 500, deliveryFreeOverCents: 5000, deliveryArea: "Within 8 km", offlinePayments: 1, onlinePayments: 0, orderPrefix: "JK-" },
    nav: nav(["Menu", "/shop"], ["Our story", "/p/about"], ["Visit", "/contact"]),
    site: { ctaLabel: "Order pickup", ctaUrl: "/shop", seoTitle: "Juniper Kitchen — seasonal plates in Calgary", seoDescription: "Wood-fired plates, fresh pasta and local produce in Calgary. Order pickup or delivery." },
    home: [
      { type: "hero", eyebrow: "Calgary · since 2019", title: "A short menu, cooked over fire.", text: "We change the menu with the market. Everything is made in-house, from the bread to the last spoon of dessert.", ctaLabel: "See the menu", ctaUrl: "/shop", cta2Label: "Book a table", cta2Url: "/contact", align: "left", tall: 1 },
      { type: "feature_list", title: "How we cook", items: "Wood fire | Everything touches the grill or the oven.\nLocal first | Produce from farms within 200 km, whenever we can.\nMade here | Bread, pasta, stocks and desserts, every morning." },
      { type: "menu_list", title: "On the menu", text: "A sample of what is cooking this week. The full menu lives in the shop.", categoryId: "", showDescriptions: 1 },
      { type: "image_text", eyebrow: "The room", title: "Small room, open kitchen.", text: "Twenty-eight seats, a counter over the pass, and a wine list that leans natural. Walk-ins are welcome at the counter.", side: "right", ctaLabel: "Find us", ctaUrl: "/contact" },
      { type: "testimonials", title: "From the room", limit: 3 },
      { type: "cta", title: "Pickup tonight", text: "Order before 4 pm and collect between 5 and 8.", ctaLabel: "Start an order", ctaUrl: "/shop", tone: "primary" }
    ],
    pages: [{
      title: "Our story", slug: "about", status: "published", sections: [
        { type: "rich_text", title: "A kitchen built around one fire", text: "Juniper started as a pop-up in a friend's bakery. We kept the short menu and the habit of cooking everything over fire.\n\nToday the kitchen runs on local produce, whole animals and a stubborn belief that a small menu is a better menu." },
        { type: "image_text", title: "The people", text: "A small team of cooks and servers who have been at it together for years. No celebrity chefs, no tasting-menu theatre.", side: "left" },
        { type: "cta", title: "Come eat", text: "Walk in, or book ahead for groups of six or more.", ctaLabel: "Contact us", ctaUrl: "/contact" }
      ]
    }],
    categories: [{ kind: "product", name: "To start" }, { kind: "product", name: "Mains" }, { kind: "product", name: "Dessert" }, { kind: "product", name: "Drinks" }],
    products: [
      P("Wood-fired sourdough", "8.00", "House levain, cultured butter, flaky salt.", "To start", { featured: 1 }),
      P("Charred broccolini", "14.00", "Tahini, chili crisp, lemon.", "To start"),
      P("Beef tartare", "19.00", "Hand-cut tenderloin, mustard, cured yolk, rye crisps.", "To start", { featured: 1 }),
      P("Wood-fired chicken", "32.00", "Half chicken, salsa verde, grilled lemon.", "Mains", { featured: 1 }),
      P("Squash agnolotti", "26.00", "Brown butter, sage, aged parmesan.", "Mains"),
      P("Dry-aged burger", "24.00", "Two patties, onion jam, cheddar, house pickles.", "Mains"),
      P("Olive oil cake", "11.00", "Whipped mascarpone, citrus.", "Dessert"),
      P("Dark chocolate tart", "12.00", "Sea salt, crème fraîche.", "Dessert", { featured: 1 }),
      P("House negroni", "15.00", "Gin, Campari, sweet vermouth, orange.", "Drinks"),
      P("Natural wine, glass", "14.00", "Ask what is open tonight.", "Drinks")
    ],
    faqs: [
      { question: "Do you take reservations?", answer: "We hold the room for walk-ins. Groups of six or more can email us." },
      { question: "Can you handle allergies?", answer: "Tell us when you order. The kitchen can work around most allergies with notice." },
      { question: "Is there parking?", answer: "Street parking after 5 pm, and a paid lot half a block north." }
    ],
    testimonials: [
      { author: "Marta L.", role: "Regular", quote: "The chicken and the olive oil cake are worth the trip across town. Service is warm without being fussy." },
      { author: "Devon R.", role: "First visit", quote: "A short menu done properly. We ordered too much and regretted nothing." },
      { author: "Priya S.", role: "Local", quote: "One of the few rooms in the city where you can hear the person across the table." }
    ]
  }),

  bakery: base("Ember & Oak Bakery", {
    tagline: "Slow bread, laminated pastry, early mornings.",
    description: "A neighbourhood bakery working with local flour and a long, slow ferment.",
    category: "Bakery",
    theme: T.warm,
    hours: HOURS.cafe,
    modules: ["content", "catalog", "commerce", "inventory", "inquiries", "newsletter", "promotions"],
    catalog: { productsLabel: "Bakery case", productSingular: "Bake" },
    commerce: { pickupEnabled: 1, deliveryEnabled: 0, offlinePayments: 1, onlinePayments: 0, orderPrefix: "EO-" },
    nav: nav(["Bakery case", "/shop"], ["About", "/p/about"], ["Visit", "/contact"]),
    site: { ctaLabel: "Order pickup", ctaUrl: "/shop" },
    home: [
      { type: "hero", eyebrow: "Calgary · baked daily", title: "Bread worth getting up for.", text: "Naturally leavened loaves, croissants laminated by hand, and a case that changes with the season.", ctaLabel: "See what's baking", ctaUrl: "/shop", align: "left" },
      { type: "product_grid", title: "Today's case", text: "Order ahead and skip the line.", limit: 6, columns: "3", featuredOnly: 0, ctaLabel: "Everything", ctaUrl: "/shop" },
      { type: "image_text", eyebrow: "Our flour", title: "Milled 200 km from here.", text: "We bake with stone-milled flour from a family farm in the foothills. The wheat changes with the harvest, and so does the bread.", side: "right" },
      { type: "feature_list", items: "48-hour ferment | Every loaf gets a long, cold rest.\nHand-laminated | Butter folded in, never a sheeter.\nSmall batches | We sell out because we bake to the day." },
      { type: "testimonials", title: "Regulars", limit: 3 },
      { type: "cta", title: "Saturday sourdough", text: "Order by Friday noon for Saturday pickup.", ctaLabel: "Order bread", ctaUrl: "/shop" }
    ],
    pages: [{ title: "About", slug: "about", status: "published", sections: [
      { type: "rich_text", title: "A bakery with one oven and a lot of patience", text: "Ember & Oak opened with a single deck oven and a starter named Doris. We still bake everything in small batches, and we still sell out most days." },
      { type: "gallery", title: "The bakery", columns: "3" }
    ] }],
    categories: [{ kind: "product", name: "Bread" }, { kind: "product", name: "Pastry" }, { kind: "product", name: "Cake" }, { kind: "product", name: "Coffee" }],
    products: [
      P("Country sourdough", "9.00", "Stone-milled flour, 48-hour ferment, dark crust.", "Bread", { featured: 1 }),
      P("Seeded rye", "10.00", "Sunflower, flax, caraway. Dense and tangy.", "Bread"),
      P("Baguette", "6.00", "Crackly crust, open crumb. Baked twice daily.", "Bread"),
      P("Butter croissant", "4.75", "Three-day lamination, cultured butter.", "Pastry", { featured: 1 }),
      P("Cinnamon bun", "5.50", "Cardamom sugar, cream cheese glaze.", "Pastry", { featured: 1 }),
      P("Pain au chocolat", "5.25", "Two bars of dark chocolate.", "Pastry"),
      P("Lemon olive oil cake", "7.00", "Whole lemon, yogurt, olive oil.", "Cake"),
      P("Filter coffee", "3.50", "Rotating single origin.", "Coffee")
    ],
    faqs: [
      { question: "Do you hold loaves?", answer: "We hold pre-orders until 2 pm. Walk-in stock is first come, first served." },
      { question: "Can I order a large batch?", answer: "Yes — give us three days' notice for more than a dozen loaves." }
    ],
    testimonials: [
      { author: "Helen W.", role: "Saturday regular", quote: "The only croissant in the city that shatters properly." },
      { author: "Sam T.", role: "Neighbour", quote: "I plan my week around the seeded rye." }
    ]
  }),

  "coffee-shop": base("Morning Bell Coffee", {
    tagline: "A small bar, a good grinder, no rush.",
    description: "Neighbourhood coffee bar with a short pastry case and a rotating filter list.",
    category: "Coffee shop",
    theme: T.minimal,
    hours: HOURS.cafe,
    modules: ["content", "catalog", "commerce", "inventory", "inquiries", "newsletter"],
    catalog: { productsLabel: "Menu", productSingular: "Drink" },
    commerce: { pickupEnabled: 1, offlinePayments: 1, orderPrefix: "MB-" },
    nav: nav(["Menu", "/shop"], ["About", "/p/about"], ["Visit", "/contact"]),
    home: [
      { type: "hero", eyebrow: "Calgary · 7 am daily", title: "Coffee, done carefully.", text: "Two espressos, one filter, and a pastry case that empties by noon.", ctaLabel: "Order ahead", ctaUrl: "/shop", align: "center" },
      { type: "menu_list", title: "The bar", showDescriptions: 1 },
      { type: "image_text", title: "A rotating filter list", text: "We keep two espresso options and one filter on at a time, changing them as bags run out. Ask what is open — we will tell you what it tastes like.", side: "left" },
      { type: "contact_hours", title: "Find the bar", showHours: 1, showMap: 1 }
    ],
    pages: [{ title: "About", slug: "about", status: "published", sections: [
      { type: "rich_text", title: "Small by design", text: "One bar, two baristas, a handful of seats. We roast with a small local roaster and grind to order." }
    ] }],
    categories: [{ kind: "product", name: "Espresso" }, { kind: "product", name: "Filter" }, { kind: "product", name: "Pastry" }, { kind: "product", name: "Beans" }],
    products: [
      P("Espresso", "3.25", "Double shot, house blend.", "Espresso", { featured: 1 }),
      P("Cappuccino", "4.75", "Six ounces, dense foam.", "Espresso", { featured: 1 }),
      P("Flat white", "5.00", "Double ristretto, whole milk.", "Espresso"),
      P("Filter, 12 oz", "3.75", "Rotating single origin.", "Filter"),
      P("Cold brew", "5.25", "18-hour steep, served over ice.", "Filter", { featured: 1 }),
      P("Butter croissant", "4.50", "From the bakery two doors down.", "Pastry"),
      P("Morning bun", "4.75", "Orange zest, cinnamon sugar.", "Pastry"),
      P("House beans, 340 g", "19.00", "Whole bean or ground to order.", "Beans")
    ],
    faqs: [{ question: "Do you have wifi?", answer: "Yes, and outlets at the window bar. We ask laptops to move on at noon on weekends." }],
    testimonials: [{ author: "Nadia K.", role: "Weekday regular", quote: "The flat white is consistent, which is rarer than it should be." }]
  }),

  "food-truck": base("Rolling Fork", {
    tagline: "Tacos, burritos and a moving schedule.",
    description: "A food truck working Calgary breweries and lunch stops, with a menu built for one hand.",
    category: "Food truck",
    theme: T.bold,
    hours: { mon: { closed: true, open: "11:00", close: "20:00" }, tue: { closed: true, open: "11:00", close: "20:00" }, wed: { closed: false, open: "11:00", close: "20:00" }, thu: { closed: false, open: "11:00", close: "20:00" }, fri: { closed: false, open: "11:00", close: "21:00" }, sat: { closed: false, open: "12:00", close: "21:00" }, sun: { closed: false, open: "12:00", close: "18:00" } },
    modules: ["content", "catalog", "commerce", "promotions", "inquiries", "newsletter"],
    catalog: { productsLabel: "Menu", productSingular: "Item" },
    commerce: { pickupEnabled: 1, offlinePayments: 1, orderPrefix: "RF-" },
    nav: nav(["Menu", "/shop"], ["Find us", "/contact"]),
    site: { ctaLabel: "Order ahead", ctaUrl: "/shop", announcement: "This week: Friday at High Line Brewing, 4–9 pm." },
    home: [
      { type: "hero", eyebrow: "Calgary · moving daily", title: "Follow the truck.", text: "Tacos, burritos and elote, cooked to order. Check the schedule, order ahead, pick up at the window.", ctaLabel: "Order ahead", ctaUrl: "/shop", cta2Label: "This week's stops", cta2Url: "/contact", align: "left" },
      { type: "menu_list", title: "The menu", text: "Everything is made to order. Salsas are house-made; ask for the hot one.", showDescriptions: 1 },
      { type: "feature_list", items: "Fresh masa | Tortillas pressed to order.\nLocal beef | Ground daily by a butcher two blocks away.\nVegetarian by default | The mushroom taco is not an afterthought." },
      { type: "cta", title: "Book the truck", text: "Private events, weddings and office lunches. We bring the whole setup.", ctaLabel: "Ask about dates", ctaUrl: "/contact", tone: "accent" }
    ],
    pages: [{ title: "Find us", slug: "find-us", status: "published", sections: [
      { type: "rich_text", title: "This week", text: "Wednesday — Central Library plaza, 11 am to 2 pm\nThursday — East Village, 11 am to 2 pm\nFriday — High Line Brewing, 4 to 9 pm\nSaturday — Farmers' market, 9 am to 1 pm" },
      { type: "contact_hours", title: "Get in touch" }
    ] }],
    categories: [{ kind: "product", name: "Tacos" }, { kind: "product", name: "Burritos" }, { kind: "product", name: "Sides" }, { kind: "product", name: "Drinks" }],
    products: [
      P("Carne asada taco", "4.50", "Grilled beef, onion, cilantro, lime.", "Tacos", { featured: 1 }),
      P("Mushroom taco", "4.25", "Roasted mushrooms, salsa verde, queso fresco.", "Tacos", { featured: 1 }),
      P("Carnitas taco", "4.75", "Slow pork, pickled onion, salsa roja.", "Tacos"),
      P("Burrito", "13.00", "Rice, beans, cheese, your choice of filling.", "Burritos", { featured: 1 }),
      P("Elote", "6.00", "Grilled corn, mayo, cotija, chili.", "Sides"),
      P("Chips & salsa", "5.00", "House tortilla chips, two salsas.", "Sides"),
      P("Horchata", "4.00", "Rice, cinnamon, a little vanilla.", "Drinks")
    ],
    faqs: [{ question: "Where are you this week?", answer: "The schedule is on the Find us page and updated every Monday." }, { question: "Can you cater?", answer: "Yes. Email us with a date and headcount." }]
  }),

  catering: base("Table & Thyme Catering", {
    tagline: "Good food, brought to your room.",
    description: "Full-service catering for meetings, weddings and family events across Calgary.",
    category: "Catering",
    theme: T.warm,
    hours: HOURS.office,
    modules: ["content", "catalog", "services", "commerce", "inquiries", "newsletter", "promotions"],
    catalog: { productsLabel: "Platters", productSingular: "Platter", servicesLabel: "Packages", serviceSingular: "Package" },
    commerce: { pickupEnabled: 0, deliveryEnabled: 1, deliveryFeeCents: 0, deliveryArea: "Calgary and 30 km", offlinePayments: 1, orderPrefix: "TT-" },
    nav: nav(["Platters", "/shop"], ["Packages", "/services"], ["Contact", "/contact"]),
    home: [
      { type: "hero", eyebrow: "Calgary catering", title: "Food that lets you stay in the conversation.", text: "Breakfast meetings, working lunches, weddings and long tables. We handle the food; you handle the room.", ctaLabel: "See packages", ctaUrl: "/services", cta2Label: "Request a quote", cta2Url: "/contact", align: "left" },
      { type: "service_grid", title: "Packages", text: "Per-person pricing, delivered and set up.", limit: 6, columns: "3" },
      { type: "feature_list", items: "Real plates | Reusable service ware on request.\nDietary care | Vegetarian, vegan and gluten-free by default.\nOne contact | The person who quotes is the person on site." },
      { type: "gallery", title: "Recent tables", columns: "3" },
      { type: "cta", title: "Tell us about your event", text: "Date, headcount and any dietary needs. We reply within one business day.", ctaLabel: "Request a quote", ctaUrl: "/contact" }
    ],
    pages: [{ title: "How it works", slug: "how-it-works", status: "published", sections: [
      { type: "rich_text", title: "From quote to cleanup", text: "Tell us the date, the room and the headcount. We send a menu and a quote within a day. Two weeks out we confirm numbers; the week of, we confirm access and timing.\n\nOn the day we arrive early, set up, serve and clear. You get an invoice the next morning." }
    ] }],
    categories: [{ kind: "product", name: "Breakfast" }, { kind: "product", name: "Lunch" }, { kind: "product", name: "Dessert" }, { kind: "service", name: "Packages" }],
    products: [
      P("Morning pastry platter", "48.00", "Serves 10. Croissants, scones, seasonal preserves.", "Breakfast", { featured: 1 }),
      P("Yogurt & granola cups", "42.00", "Serves 10. House granola, berries.", "Breakfast"),
      P("Sandwich platter", "95.00", "Serves 12. Three kinds, cut in halves.", "Lunch", { featured: 1 }),
      P("Seasonal salad bowl", "65.00", "Serves 10. Dressings on the side.", "Lunch"),
      P("Cookie box", "36.00", "Serves 12. Two kinds, baked that morning.", "Dessert")
    ],
    services: [
      S("Working lunch", "24", 120, "Sandwiches, salad, a sweet, coffee service. Per person.", "Packages", { price_type: "from" }),
      S("Breakfast meeting", "16", 90, "Pastries, fruit, yogurt, coffee. Per person.", "Packages", { price_type: "from" }),
      S("Wedding table", "58", 240, "Three courses, family style, staffed service. Per person.", "Packages", { price_type: "from" }),
      S("Custom event", "0", 180, "Tell us the brief and we will quote it.", "Packages", { price_type: "quote" })
    ],
    faqs: [{ question: "How far ahead should I book?", answer: "Two weeks is comfortable. We can sometimes turn around a small order in 48 hours." }]
  }),

  /* ----------------------------- Automotive ------------------------------- */
  "auto-repair": base("Northgate Auto", {
    tagline: "Straight answers, careful work.",
    description: "Independent auto repair for domestic and import vehicles, with written estimates before any work begins.",
    category: "Auto repair",
    theme: T.minimal,
    hours: HOURS.shop,
    modules: ["content", "services", "bookings", "inquiries", "reviews", "newsletter", "customers"],
    catalog: { productsLabel: "Parts", productSingular: "Part", servicesLabel: "Services", serviceSingular: "Service" },
    bookings: { slotIntervalMin: 60, leadHours: 12, maxAdvanceDays: 45, confirmationMode: "manual", requirePhone: 1 },
    nav: nav(["Services", "/services"], ["Book", "/book"], ["About", "/p/about"], ["Contact", "/contact"]),
    site: { ctaLabel: "Book a service", ctaUrl: "/book", seoTitle: "Northgate Auto — honest auto repair in Calgary" },
    home: [
      { type: "hero", eyebrow: "Calgary · independent since 2008", title: "The estimate is the estimate.", text: "We inspect, explain and quote in writing before we touch a bolt. No surprise line items.", ctaLabel: "Book a service", ctaUrl: "/book", cta2Label: "See services", cta2Url: "/services", align: "left" },
      { type: "service_grid", title: "What we do", text: "Maintenance, diagnostics and repair for most makes and models.", limit: 6, columns: "3", ctaLabel: "Book", ctaUrl: "/book" },
      { type: "feature_list", title: "Why people come back", items: "Photos, not guesses | We send a photo of the worn part before we replace it.\nTwo-year warranty | On parts and labour, in writing.\nLoaner cars | Book ahead and we will keep you moving." },
      { type: "stats", items: "17 years | In the same bay\n4.8 / 5 | From 220 reviews\n2 years | Parts and labour warranty" },
      { type: "testimonials", title: "From our customers", limit: 3 },
      { type: "booking_cta", title: "Need a slot this week?", text: "Most jobs can be seen within two business days.", ctaLabel: "See available times", ctaUrl: "/book" }
    ],
    pages: [{ title: "About", slug: "about", status: "published", sections: [
      { type: "rich_text", title: "A shop, not a sales floor", text: "Northgate is owned by two mechanics who got tired of commission-based repair. We do not sell services you do not need, and we show you the part we took off.\n\nWe work on most domestic and import vehicles, and we are honest about what we do not know." },
      { type: "image_text", title: "The bay", text: "Six lifts, a dedicated diagnostic bay and a waiting room with actual coffee.", side: "right" }
    ] }],
    categories: [{ kind: "service", name: "Maintenance" }, { kind: "service", name: "Repair" }, { kind: "service", name: "Diagnostics" }],
    services: [
      S("Oil & filter change", "89", 45, "Full synthetic, new filter, 20-point inspection.", "Maintenance", { featured: 1 }),
      S("Brake inspection & service", "249", 120, "Pads, rotors and fluid as needed. Quote before work.", "Repair", { featured: 1 }),
      S("Check-engine diagnostic", "129", 60, "Scan, road test and a written explanation.", "Diagnostics", { featured: 1 }),
      S("Tire rotation", "49", 30, "Rotate, torque and set pressures.", "Maintenance"),
      S("Wheel alignment", "139", 60, "Four-wheel alignment with before/after printout.", "Maintenance"),
      S("Air conditioning service", "159", 90, "Leak check, evacuate and recharge.", "Repair")
    ],
    faqs: [
      { question: "Do you work on hybrids?", answer: "Yes, for most maintenance and brake work. We do not service high-voltage battery packs." },
      { question: "Can I wait?", answer: "Yes, there is a waiting room. For jobs over two hours we recommend dropping off." },
      { question: "Do you provide loaners?", answer: "Two loaners are available if you book at least a week ahead." }
    ],
    testimonials: [
      { author: "Chris D.", role: "Customer since 2016", quote: "They talked me out of a repair another shop insisted on. That is why I keep coming back." },
      { author: "Amina H.", role: "New customer", quote: "Photos of the worn brake pads, a clear quote, and the bill matched." },
      { author: "Rob P.", role: "Fleet manager", quote: "Six vans, one shop. They keep them on the road." }
    ]
  }),

  "auto-detailing": base("Lumen Detailing", {
    tagline: "Paint correction, ceramic coating, interiors.",
    description: "A detailing studio for daily drivers and weekend cars, working by appointment only.",
    category: "Auto detailing",
    theme: T.luxe,
    hours: { mon: { closed: false, open: "08:00", close: "18:00" }, tue: { closed: false, open: "08:00", close: "18:00" }, wed: { closed: false, open: "08:00", close: "18:00" }, thu: { closed: false, open: "08:00", close: "18:00" }, fri: { closed: false, open: "08:00", close: "18:00" }, sat: { closed: false, open: "09:00", close: "15:00" }, sun: { closed: true, open: "09:00", close: "15:00" } },
    modules: ["content", "services", "bookings", "inquiries", "reviews", "newsletter"],
    bookings: { slotIntervalMin: 120, leadHours: 24, maxAdvanceDays: 60, confirmationMode: "manual" },
    nav: nav(["Services", "/services"], ["Book", "/book"], ["Gallery", "/p/gallery"], ["Contact", "/contact"]),
    home: [
      { type: "hero", eyebrow: "Calgary · by appointment", title: "The car you already own, looking new.", text: "Paint correction, ceramic coating and interiors, done in a controlled studio with proper lighting.", ctaLabel: "Book a consultation", ctaUrl: "/book", cta2Label: "See the work", cta2Url: "/p/gallery", align: "center" },
      { type: "service_grid", title: "Services", text: "Every job starts with an inspection and a written plan.", limit: 6, columns: "3" },
      { type: "gallery", title: "Recent work", columns: "3" },
      { type: "feature_list", items: "One car at a time | No production line.\nMeasured paint | Depth readings before and after.\nWritten plan | You approve the scope before we start." },
      { type: "testimonials", title: "Owners", limit: 3 },
      { type: "booking_cta", title: "Consultations are free", text: "Twenty minutes, your car, a written recommendation.", ctaLabel: "Book a time", ctaUrl: "/book" }
    ],
    pages: [{ title: "Gallery", slug: "gallery", status: "published", sections: [
      { type: "gallery", title: "Before and after", text: "A selection of recent work.", columns: "3" },
      { type: "cta", title: "Your car next", ctaLabel: "Book a consultation", ctaUrl: "/book" }
    ] }],
    categories: [{ kind: "service", name: "Detailing" }, { kind: "service", name: "Paint protection" }, { kind: "service", name: "Interior" }],
    services: [
      S("Maintenance wash", "89", 90, "Hand wash, decontamination, sealant top-up.", "Detailing", { featured: 1 }),
      S("Interior detail", "249", 240, "Steam, extraction, leather care, ozone.", "Interior", { featured: 1 }),
      S("Full detail", "499", 480, "Interior and exterior, one stage of polish.", "Detailing", { featured: 1 }),
      S("Paint correction", "899", 600, "Multi-stage machine polish to remove swirls.", "Paint protection", { price_type: "from" }),
      S("Ceramic coating", "1499", 900, "Two-layer coating with a five-year warranty.", "Paint protection", { price_type: "from" })
    ],
    faqs: [{ question: "How long will my car be with you?", answer: "A maintenance wash is half a day. A full detail is one to two days. Coatings need two to three days." }]
  }),

  dealership: base("Summit Motors", {
    tagline: "Used cars, inspected and warrantied.",
    description: "A small used-car dealership with a workshop, transparent history reports and a seven-day return window.",
    category: "Car dealership",
    theme: T.coastal,
    hours: HOURS.retail,
    modules: ["content", "catalog", "services", "inquiries", "reviews", "newsletter", "promotions"],
    catalog: { productsLabel: "Inventory", productSingular: "Vehicle", servicesLabel: "Visit us", serviceSingular: "Appointment" },
    nav: nav(["Inventory", "/shop"], ["Financing", "/p/financing"], ["Contact", "/contact"]),
    site: { ctaLabel: "Browse inventory", ctaUrl: "/shop" },
    home: [
      { type: "hero", eyebrow: "Calgary · 40 cars on the lot", title: "A used car you can actually check.", text: "Every vehicle gets a 150-point inspection, a full history report and a seven-day return window.", ctaLabel: "Browse inventory", ctaUrl: "/shop", cta2Label: "Book a test drive", cta2Url: "/contact", align: "left" },
      { type: "product_grid", title: "Recently arrived", limit: 6, columns: "3", ctaLabel: "See all vehicles", ctaUrl: "/shop" },
      { type: "feature_list", items: "150-point inspection | With the report in the glovebox.\nSeven-day return | Bring it back, no argument.\nFinancing in-house | Decisions the same day." },
      { type: "cta", title: "Trade-in appraisal", text: "Send us the year, model and mileage. We will give you a range the same day.", ctaLabel: "Get a range", ctaUrl: "/contact" }
    ],
    pages: [{ title: "Financing", slug: "financing", status: "published", sections: [
      { type: "rich_text", title: "Financing without the runaround", text: "We work with three lenders and a credit union. Bring your ID, proof of income and a recent bank statement; most decisions come back the same day.\n\nNo application fee, and no obligation to buy." }
    ] }],
    categories: [{ kind: "product", name: "SUVs" }, { kind: "product", name: "Sedans" }, { kind: "product", name: "Trucks" }],
    products: [
      P("2019 Toyota RAV4 XLE", "27950", "68,400 km · AWD · one owner · full service history.", "SUVs", { featured: 1, attributes: "Year | 2019\nMileage | 68,400 km\nDrivetrain | AWD\nTransmission | Automatic" }),
      P("2020 Honda Civic LX", "22950", "54,100 km · local trade · new tires.", "Sedans", { featured: 1, attributes: "Year | 2020\nMileage | 54,100 km\nTransmission | CVT" }),
      P("2021 Ford F-150 XLT", "38950", "71,200 km · 3.5L EcoBoost · tow package.", "Trucks", { featured: 1, attributes: "Year | 2021\nMileage | 71,200 km\nEngine | 3.5L V6\nTowing | 5,400 kg" }),
      P("2018 Subaru Outback", "21500", "92,300 km · AWD · timing belt done.", "SUVs", { attributes: "Year | 2018\nMileage | 92,300 km\nDrivetrain | AWD" }),
      P("2020 Mazda3 GT", "23900", "48,900 km · leather · sunroof.", "Sedans", { attributes: "Year | 2020\nMileage | 48,900 km" })
    ],
    services: [
      S("Test drive", "0", 60, "Bring your licence. We will have the car ready.", "Visit us", { price_type: "quote" }),
      S("Trade-in appraisal", "0", 45, "Fifteen minutes with the appraiser, a written range.", "Visit us", { price_type: "quote" })
    ],
    faqs: [{ question: "Can I get an independent inspection?", answer: "Yes, and we encourage it. We will make the car available at your mechanic." }, { question: "Is financing available?", answer: "Yes, through three lenders. Most decisions are same-day." }],
    testimonials: [{ author: "Leah M.", role: "Bought a RAV4", quote: "The inspection report found a worn sway bar link — they replaced it before delivery without being asked." }]
  }),

  "tire-shop": base("Prairie Tire & Wheel", {
    tagline: "Tires, alignment, seasonal changeovers.",
    description: "Tire retail and installation with a Hunter alignment rack and winter storage.",
    category: "Tire shop",
    theme: T.bold,
    hours: HOURS.shop,
    modules: ["content", "catalog", "services", "bookings", "commerce", "inventory", "inquiries", "promotions"],
    catalog: { productsLabel: "Tires", productSingular: "Tire", servicesLabel: "Services", serviceSingular: "Service" },
    commerce: { pickupEnabled: 1, offlinePayments: 1, orderPrefix: "PT-" },
    bookings: { slotIntervalMin: 30, leadHours: 4, maxAdvanceDays: 30, confirmationMode: "auto" },
    nav: nav(["Tires", "/shop"], ["Services", "/services"], ["Book", "/book"]),
    home: [
      { type: "hero", eyebrow: "Calgary · winter is coming", title: "Tires on, balanced, torqued.", text: "Book a changeover, compare all-season and winter sets, or have us store the off-season set.", ctaLabel: "Book a changeover", ctaUrl: "/book", cta2Label: "Shop tires", cta2Url: "/shop", align: "left" },
      { type: "service_grid", title: "In the bay", limit: 4, columns: "2" },
      { type: "product_grid", title: "Popular tires", limit: 4, columns: "4" },
      { type: "feature_list", items: "Hunter alignment | Printout before and after.\nTorque to spec | Every wheel, by hand, with a wrench.\nSeasonal storage | Clean, dry and labelled." }
    ],
    pages: [{ title: "Winter tires", slug: "winter", status: "published", sections: [
      { type: "rich_text", title: "Winter tires, explained without the sales pitch", text: "Below 7 °C, all-season rubber hardens and stopping distances grow. A dedicated winter tire is the single biggest safety upgrade you can make in Calgary.\n\nWe stock sizes for most vehicles and can order anything within two days. Storage is available if you do not have room." }
    ] }],
    categories: [{ kind: "product", name: "Winter tires" }, { kind: "product", name: "All-season tires" }, { kind: "product", name: "Wheels" }, { kind: "service", name: "Installation" }],
    products: [
      P("Michelin X-Ice Snow, 225/65R17", "289", "Per tire. Studless winter, excellent ice grip.", "Winter tires", { featured: 1 }),
      P("Bridgestone Blizzak WS90, 205/55R16", "219", "Per tire. Proven winter compound.", "Winter tires", { featured: 1 }),
      P("Nokian Hakkapeliitta R5, 235/60R18", "349", "Per tire. Premium Nordic winter tire.", "Winter tires"),
      P("Michelin Defender2, 225/65R17", "259", "Per tire. Long-wear all-season.", "All-season tires", { featured: 1 }),
      P("Steel wheel, 16 inch", "89", "Per wheel. Winter setup.", "Wheels")
    ],
    services: [
      S("Tire changeover", "89", 45, "Mount, balance, torque and pressure set.", "Installation", { featured: 1 }),
      S("New tire installation", "45", 45, "Per tire, including balance and disposal.", "Installation", { featured: 1 }),
      S("Wheel alignment", "139", 60, "Four-wheel Hunter alignment with printout.", "Installation"),
      S("Seasonal storage", "120", 15, "Per season, per set. Clean and dry.", "Installation")
    ],
    faqs: [{ question: "When should I book winter tires?", answer: "October fills up fast. Book by the end of September for the best choice of times." }]
  }),

  /* ------------------------------ Services -------------------------------- */
  "home-services": base("Cedar Plumbing & Heating", {
    tagline: "Licensed plumbers, clear pricing.",
    description: "Residential plumbing and heating repair, with upfront pricing and no overtime charges.",
    category: "Home services",
    theme: T.coastal,
    hours: HOURS.shop,
    modules: ["content", "services", "bookings", "inquiries", "reviews", "newsletter"],
    bookings: { slotIntervalMin: 60, leadHours: 6, maxAdvanceDays: 30, confirmationMode: "manual" },
    nav: nav(["Services", "/services"], ["Book", "/book"], ["About", "/p/about"], ["Contact", "/contact"]),
    site: { ctaLabel: "Book a plumber", ctaUrl: "/book" },
    home: [
      { type: "hero", eyebrow: "Calgary · licensed & insured", title: "The price before the van arrives.", text: "Repairs, replacements and emergencies. We quote before we start and clean up when we leave.", ctaLabel: "Book a visit", ctaUrl: "/book", cta2Label: "Call us", cta2Url: "tel:+14035550142", align: "left" },
      { type: "service_grid", title: "What we fix", limit: 6, columns: "3" },
      { type: "feature_list", items: "Upfront pricing | The quote is the invoice.\nNo overtime | Evenings and weekends cost the same.\nLicensed | Red Seal journeymen, fully insured." },
      { type: "testimonials", title: "Neighbours", limit: 3 },
      { type: "booking_cta", title: "Emergency?", text: "Call us. If we cannot get there, we will tell you who can.", ctaLabel: "Book a visit", ctaUrl: "/book" }
    ],
    pages: [{ title: "About", slug: "about", status: "published", sections: [
      { type: "rich_text", title: "Two vans, four plumbers, one standard", text: "Cedar started in 2014 with one van and a promise to quote before starting. We now run two vans and four licensed plumbers, and the promise has not changed." },
      { type: "feature_list", items: "Red Seal | Every plumber is journeyman-certified.\nInsured | $5M liability, WCB covered.\nWarranty | One year on labour." }
    ] }],
    categories: [{ kind: "service", name: "Plumbing" }, { kind: "service", name: "Heating" }, { kind: "service", name: "Emergency" }],
    services: [
      S("Drain cleaning", "189", 60, "Snake or jet, depending on the blockage.", "Plumbing", { featured: 1 }),
      S("Faucet replacement", "149", 60, "Labour only; fixture supplied by you or us.", "Plumbing", { featured: 1 }),
      S("Water heater replacement", "299", 180, "Labour. Tank supplied separately.", "Heating", { featured: 1, price_type: "from" }),
      S("Furnace tune-up", "129", 90, "Clean, test, replace filter.", "Heating"),
      S("Toilet repair", "129", 45, "Fill valve, flapper or seal.", "Plumbing"),
      S("Emergency call-out", "99", 60, "After hours. Diagnostic credited against the repair.", "Emergency")
    ],
    faqs: [{ question: "Do you charge a call-out fee?", answer: "A $99 diagnostic applies to emergency calls and is credited against the repair." }, { question: "Are you insured?", answer: "Yes — $5M liability and WCB coverage. Certificates available on request." }],
    testimonials: [{ author: "Janet F.", role: "Homeowner", quote: "Quoted $189 for the drain, charged $189. He also fixed the flapper while he was there, no charge." }]
  }),

  "professional-services": base("Harbour Accounting", {
    tagline: "Books, taxes and calm year-ends.",
    description: "Accounting and bookkeeping for small businesses and freelancers, with fixed monthly fees.",
    category: "Professional services",
    theme: T.minimal,
    hours: HOURS.office,
    modules: ["content", "services", "bookings", "inquiries", "reviews", "newsletter", "accounts"],
    catalog: { servicesLabel: "Services", serviceSingular: "Service" },
    bookings: { slotIntervalMin: 30, leadHours: 24, maxAdvanceDays: 60, confirmationMode: "auto" },
    nav: nav(["Services", "/services"], ["Book a call", "/book"], ["About", "/p/about"], ["Contact", "/contact"]),
    site: { ctaLabel: "Book a call", ctaUrl: "/book" },
    home: [
      { type: "hero", eyebrow: "Calgary · CPA", title: "Your books, closed on time.", text: "Monthly bookkeeping, year-end filings and tax planning for owner-operated businesses. Fixed fees, no surprise invoices.", ctaLabel: "Book a 20-minute call", ctaUrl: "/book", cta2Label: "See services", cta2Url: "/services", align: "left" },
      { type: "service_grid", title: "How we help", limit: 6, columns: "3", ctaLabel: "Book", ctaUrl: "/book" },
      { type: "image_text", eyebrow: "Our approach", title: "A named accountant, not a ticket queue.", text: "You work with one CPA who knows your file. We use your existing software where it works, and we do not charge by the email.", side: "right" },
      { type: "stats", items: "120+ | Businesses served\n11 years | In practice\n48 h | Typical response time" },
      { type: "testimonials", title: "Clients", limit: 3 },
      { type: "faq", title: "Common questions", limit: 5 }
    ],
    pages: [{ title: "About", slug: "about", status: "published", sections: [
      { type: "rich_text", title: "Small firm, senior people", text: "Harbour is a three-person practice. Every client works directly with a CPA, and every engagement has a fixed monthly fee agreed in writing before it starts.\n\nWe work with trades, consultants, cafés and online retailers — businesses small enough that the owner still does the banking." },
      { type: "cta", title: "Not sure what you need?", text: "Book a free 20-minute call. We will tell you whether we are the right fit.", ctaLabel: "Book a call", ctaUrl: "/book" }
    ] }],
    categories: [{ kind: "service", name: "Accounting" }, { kind: "service", name: "Tax" }, { kind: "service", name: "Advisory" }],
    services: [
      S("Bookkeeping", "450", 60, "Monthly reconciliation, reports and a call. Per month.", "Accounting", { featured: 1, price_type: "from" }),
      S("Year-end financial statements", "1200", 180, "Compilation and filing. Fixed fee.", "Accounting", { featured: 1 }),
      S("Personal tax return", "250", 60, "T1 with one employment slip. Additional slips quoted.", "Tax", { featured: 1 }),
      S("Corporate tax return", "950", 120, "T2 with financial statements.", "Tax"),
      S("Tax planning session", "300", 60, "One hour, written summary.", "Advisory"),
      S("New business setup", "600", 90, "Incorporation, CRA accounts, first-year plan.", "Advisory")
    ],
    faqs: [
      { question: "Do you work remotely?", answer: "Yes. Most clients upload documents and meet by video. In-person meetings are available in Calgary." },
      { question: "What software do you use?", answer: "QuickBooks Online or Xero, depending on what you already have. We can migrate you." },
      { question: "How are fees set?", answer: "A fixed monthly or per-engagement fee, agreed in writing before work starts." }
    ],
    testimonials: [
      { author: "Tomas B.", role: "Café owner", quote: "First year we have not had a tax-time panic. The monthly fee is the same every month." },
      { author: "Rina S.", role: "Consultant", quote: "They found deductions my old accountant missed and explained each one." }
    ]
  }),

  consulting: base("Kestrel Consulting", {
    tagline: "Operations work that sticks.",
    description: "Operations and growth consulting for founder-led companies between 10 and 100 people.",
    category: "Consulting",
    theme: T.luxe,
    hours: HOURS.office,
    modules: ["content", "services", "bookings", "inquiries", "newsletter", "reviews"],
    bookings: { slotIntervalMin: 30, leadHours: 24, maxAdvanceDays: 90, confirmationMode: "auto" },
    nav: nav(["Services", "/services"], ["Approach", "/p/approach"], ["Book a call", "/book"], ["Contact", "/contact"]),
    site: { ctaLabel: "Book a call", ctaUrl: "/book" },
    home: [
      { type: "hero", eyebrow: "Calgary · working globally", title: "The unglamorous work that makes a company run.", text: "Process design, operating cadences and the difficult middle of scaling. We stay until the change holds.", ctaLabel: "Book a discovery call", ctaUrl: "/book", cta2Label: "How we work", cta2Url: "/p/approach", align: "center" },
      { type: "service_grid", title: "Engagements", limit: 3, columns: "3" },
      { type: "stats", items: "38 | Companies advised\n4.2× | Median revenue growth over 24 months\n92% | Clients who re-engage" },
      { type: "testimonials", title: "What clients say", limit: 3 },
      { type: "faq", title: "Working with us", limit: 5 },
      { type: "cta", title: "Start with a conversation", text: "Thirty minutes, no deck. We will tell you if we can help.", ctaLabel: "Book a call", ctaUrl: "/book" }
    ],
    pages: [{ title: "Approach", slug: "approach", status: "published", sections: [
      { type: "rich_text", title: "Diagnose, design, embed", text: "We start by talking to the people doing the work. Then we design the smallest change that fixes the constraint, and we stay to make it routine.\n\nNo 80-slide decks. No transformation programme that outlives its usefulness. A short plan, owned by your team." },
      { type: "feature_list", items: "Senior only | The person who sells is the person who delivers.\nFixed scope | A written scope and fee before we start.\nExit criteria | We define what done looks like on day one." }
    ] }],
    categories: [{ kind: "service", name: "Advisory" }, { kind: "service", name: "Workshops" }],
    services: [
      S("Discovery call", "0", 30, "Thirty minutes to see whether we are a fit.", "Advisory", { price_type: "quote" }),
      S("Operations audit", "4800", 600, "Two weeks, interviews and a written plan.", "Advisory", { featured: 1 }),
      S("Strategy sprint", "7500", 900, "One week with your leadership team.", "Workshops", { featured: 1 }),
      S("Fractional COO", "0", 60, "Two days a week, monthly retainer.", "Advisory", { price_type: "quote" }),
      S("Team workshop", "3200", 300, "Half-day facilitation for up to 12 people.", "Workshops")
    ],
    faqs: [
      { question: "What size company do you work with?", answer: "Usually 10 to 100 people, founder-led, past product-market fit and stuck on operations." },
      { question: "Do you work on retainer?", answer: "Sometimes. Most engagements start with a fixed-scope audit or sprint." }
    ],
    testimonials: [
      { author: "Anika R.", role: "CEO, software company", quote: "They fixed the thing we kept arguing about in week one, then made it stick." },
      { author: "Marc D.", role: "Founder", quote: "Refreshingly free of jargon. We got a plan we could actually run." }
    ]
  }),

  cleaning: base("Brightline Cleaning", {
    tagline: "Homes and offices, cleaned properly.",
    description: "Residential and small-office cleaning with the same team every visit.",
    category: "Cleaning",
    theme: T.coastal,
    hours: HOURS.shop,
    modules: ["content", "services", "bookings", "inquiries", "reviews", "newsletter"],
    bookings: { slotIntervalMin: 60, leadHours: 12, maxAdvanceDays: 45, confirmationMode: "auto" },
    nav: nav(["Services", "/services"], ["Book", "/book"], ["Contact", "/contact"]),
    home: [
      { type: "hero", eyebrow: "Calgary · bonded & insured", title: "The same team, every visit.", text: "Recurring home cleaning and small-office care, with a checklist you can see and a team you will recognise.", ctaLabel: "Book a clean", ctaUrl: "/book", cta2Label: "See prices", cta2Url: "/services", align: "left" },
      { type: "service_grid", title: "Cleaning services", limit: 6, columns: "3" },
      { type: "feature_list", items: "Same cleaners | No rotating crews.\nChecklist | What we clean, in writing.\nBonded | Background-checked and insured." },
      { type: "testimonials", title: "Clients", limit: 3 },
      { type: "booking_cta", title: "First clean?", text: "Book a deep clean and we will quote a recurring rate afterwards.", ctaLabel: "See available times", ctaUrl: "/book" }
    ],
    pages: [{ title: "What's included", slug: "included", status: "published", sections: [
      { type: "rich_text", title: "The checklist", text: "Every visit covers kitchens, bathrooms, floors, dusting and garbage. Deep cleans add inside appliances, baseboards, window tracks and interior cabinets." },
      { type: "faq", title: "Questions", limit: 5 }
    ] }],
    categories: [{ kind: "service", name: "Home" }, { kind: "service", name: "Office" }],
    services: [
      S("Standard home clean", "150", 180, "Up to 2 bedrooms. Kitchens, baths, floors, dusting.", "Home", { featured: 1, price_type: "from" }),
      S("Deep clean", "320", 300, "Inside appliances, baseboards, tracks and cabinets.", "Home", { featured: 1, price_type: "from" }),
      S("Move-out clean", "420", 360, "Empty-home clean with a checklist for the landlord.", "Home", { featured: 1 }),
      S("Office clean", "250", 180, "Small offices up to 2,000 sq ft.", "Office", { price_type: "from" }),
      S("Post-renovation clean", "480", 420, "Dust removal and fine cleaning after trades.", "Home")
    ],
    faqs: [{ question: "Do I need to be home?", answer: "No. Most clients give us a lockbox code or key. All cleaners are bonded." }, { question: "What products do you use?", answer: "Unscented, low-VOC products by default. Tell us if you prefer something else." }],
    testimonials: [{ author: "Grace L.", role: "Recurring client", quote: "Same two people every second Tuesday for three years. The house is genuinely clean." }]
  }),

  landscaping: base("Stone & Sage Landscaping", {
    tagline: "Gardens that suit the climate.",
    description: "Design, build and maintenance for Calgary yards, with a focus on native and low-water planting.",
    category: "Landscaping",
    theme: T.modern,
    hours: HOURS.shop,
    modules: ["content", "services", "bookings", "inquiries", "reviews", "newsletter"],
    bookings: { slotIntervalMin: 60, leadHours: 24, maxAdvanceDays: 60, confirmationMode: "manual" },
    nav: nav(["Services", "/services"], ["Book a visit", "/book"], ["Projects", "/p/projects"]),
    home: [
      { type: "hero", eyebrow: "Calgary · design & build", title: "A yard that survives a Calgary winter.", text: "Native planting, hardscape and low-water design, built for zone 3 and maintained by the people who built it.", ctaLabel: "Book a site visit", ctaUrl: "/book", cta2Label: "See projects", cta2Url: "/p/projects", align: "left" },
      { type: "service_grid", title: "What we do", limit: 6, columns: "3" },
      { type: "gallery", title: "Recent projects", columns: "3" },
      { type: "feature_list", items: "Zone 3 planting | Species chosen to come back every year.\nOne crew | Design, build and maintenance under one roof.\nFixed quotes | A written scope before we break ground." },
      { type: "cta", title: "Planning a project?", text: "Spring books fill in February. Tell us what you have in mind.", ctaLabel: "Book a site visit", ctaUrl: "/book" }
    ],
    pages: [{ title: "Projects", slug: "projects", status: "published", sections: [
      { type: "gallery", title: "Before and after", columns: "2" },
      { type: "rich_text", title: "A typical build", text: "Most projects run two to four weeks: one week of demolition and grading, one of hardscape, one of planting, and a final week of cleanup and irrigation." }
    ] }],
    categories: [{ kind: "service", name: "Maintenance" }, { kind: "service", name: "Design & build" }],
    services: [
      S("Lawn maintenance", "65", 60, "Mow, edge, trim. Weekly or biweekly.", "Maintenance", { featured: 1, price_type: "from" }),
      S("Spring cleanup", "250", 180, "Debris, bed turn, first cut.", "Maintenance", { featured: 1, price_type: "from" }),
      S("Garden design", "850", 240, "Site visit, planting plan and quote.", "Design & build", { featured: 1 }),
      S("Hardscape build", "0", 480, "Patios, paths and retaining walls. Quoted per project.", "Design & build", { price_type: "quote" }),
      S("Irrigation service", "180", 120, "Blow-out, repair or tune-up.", "Maintenance")
    ],
    faqs: [{ question: "When should I book a spring cleanup?", answer: "April fills quickly. Book in March for the first two weeks of April." }],
    testimonials: [{ author: "Peter M.", role: "Homeowner", quote: "They designed for our actual soil and sun, not a catalogue. Everything came back the next year." }]
  }),

  /* -------------------------------- Retail -------------------------------- */
  "retail-general": base("The General Store", {
    tagline: "Useful things for the house.",
    description: "A neighbourhood shop for kitchen, cleaning and household essentials.",
    category: "Retail",
    theme: T.modern,
    hours: HOURS.retail,
    modules: ["content", "catalog", "commerce", "payments", "delivery", "inventory", "promotions", "reviews", "newsletter", "accounts"],
    commerce: { pickupEnabled: 1, deliveryEnabled: 1, deliveryFeeCents: 700, deliveryFreeOverCents: 6000, deliveryArea: "Calgary city limits", onlinePayments: 1, offlinePayments: 1, orderPrefix: "GS-" },
    nav: nav(["Shop", "/shop"], ["About", "/p/about"], ["Visit", "/contact"]),
    home: [
      { type: "hero", eyebrow: "Calgary · open daily", title: "The things you actually run out of.", text: "Kitchen basics, cleaning supplies and good tools — chosen once, stocked properly.", ctaLabel: "Shop the shelves", ctaUrl: "/shop", align: "left" },
      { type: "product_grid", title: "On the shelf", limit: 6, columns: "3" },
      { type: "feature_list", items: "Tested first | We use what we sell.\nRefills | Bring your bottle, save a dollar.\nLocal delivery | Free over $60." },
      { type: "testimonials", title: "Neighbours", limit: 3 }
    ],
    pages: [{ title: "About", slug: "about", status: "published", sections: [
      { type: "rich_text", title: "A shop with fewer, better things", text: "We stock one good version of each thing instead of six mediocre ones. If we would not use it at home, it does not go on the shelf." }
    ] }],
    categories: [{ kind: "product", name: "Kitchen" }, { kind: "product", name: "Cleaning" }, { kind: "product", name: "Home" }],
    products: [
      P("Dish brush", "9.00", "Beech handle, replaceable head.", "Kitchen", { featured: 1 }),
      P("Cast iron skillet, 10 inch", "59.00", "Pre-seasoned, made in Canada.", "Kitchen", { featured: 1 }),
      P("Glass storage set", "42.00", "Three sizes, bamboo lids.", "Kitchen"),
      P("Laundry soap, 1 L", "18.00", "Unscented, refillable.", "Cleaning", { featured: 1 }),
      P("Cedar dish rack", "48.00", "Solid cedar, folds flat.", "Home"),
      P("Wool dryer balls, 3", "22.00", "Replaces dryer sheets.", "Cleaning")
    ],
    faqs: [{ question: "Do you deliver?", answer: "Yes, within Calgary. Free over $60, otherwise $7." }]
  }),

  "retail-specialty": base("Wilder Goods", {
    tagline: "Candles, ceramics, small gifts.",
    description: "A specialty shop for handmade home goods from Canadian makers.",
    category: "Specialty retail",
    theme: T.warm,
    hours: HOURS.retail,
    modules: ["content", "catalog", "commerce", "payments", "delivery", "inventory", "reviews", "newsletter", "accounts", "promotions"],
    commerce: { pickupEnabled: 1, deliveryEnabled: 1, deliveryFeeCents: 900, deliveryFreeOverCents: 7500, onlinePayments: 1, orderPrefix: "WG-" },
    nav: nav(["Shop", "/shop"], ["Makers", "/p/makers"], ["Visit", "/contact"]),
    home: [
      { type: "hero", eyebrow: "Calgary · Canadian makers", title: "Things made by hand, for people you like.", text: "Candles, ceramics and small gifts from thirty Canadian studios. Wrapped and ready to give.", ctaLabel: "Shop gifts", ctaUrl: "/shop", align: "center" },
      { type: "product_grid", title: "New this week", limit: 6, columns: "3" },
      { type: "image_text", eyebrow: "Our makers", title: "Thirty studios, one shelf.", text: "We buy directly from each maker, in small quantities, and pay upfront. When something sells out, it may be a few weeks before it is back.", side: "left", ctaLabel: "Meet the makers", ctaUrl: "/p/makers" },
      { type: "testimonials", title: "Nice notes", limit: 3 }
    ],
    pages: [{ title: "Makers", slug: "makers", status: "published", sections: [
      { type: "rich_text", title: "Who makes this", text: "Every product page names the studio. We work with small workshops in Calgary, Vancouver, Toronto and the Maritimes, and we visit as many as we can." }
    ] }],
    categories: [{ kind: "product", name: "Candles" }, { kind: "product", name: "Ceramics" }, { kind: "product", name: "Gifts" }],
    products: [
      P("Cedar & smoke candle", "38.00", "8 oz soy wax, 45-hour burn. Made in Calgary.", "Candles", { featured: 1 }),
      P("Stoneware mug", "32.00", "Wheel-thrown, dishwasher safe.", "Ceramics", { featured: 1 }),
      P("Linen tea towel", "24.00", "Stone-washed linen, screen printed.", "Gifts", { featured: 1 }),
      P("Ceramic vase", "58.00", "Small batch, matte glaze.", "Ceramics"),
      P("Gift box", "85.00", "Candle, mug and tea towel, wrapped.", "Gifts", { featured: 1 })
    ],
    faqs: [{ question: "Do you ship?", answer: "Across Canada, flat $15. Free over $120." }]
  }),

  "retail-clothing": base("North & Pine Apparel", {
    tagline: "Everyday clothes, made to last.",
    description: "A small clothing shop for durable everyday basics, with honest sizing and free hemming.",
    category: "Clothing",
    theme: T.luxe,
    hours: HOURS.retail,
    modules: ["content", "catalog", "commerce", "payments", "delivery", "inventory", "reviews", "newsletter", "accounts", "promotions"],
    commerce: { pickupEnabled: 1, deliveryEnabled: 1, deliveryFeeCents: 800, deliveryFreeOverCents: 9000, onlinePayments: 1, orderPrefix: "NP-" },
    catalog: { productsLabel: "Shop", productSingular: "Piece" },
    nav: nav(["Shop", "/shop"], ["Sizing", "/p/sizing"], ["Visit", "/contact"]),
    home: [
      { type: "hero", eyebrow: "Calgary · everyday wear", title: "Fewer, better clothes.", text: "Heavyweight cotton, wool and linen, cut for real bodies. Free hemming on everything we sell.", ctaLabel: "Shop the collection", ctaUrl: "/shop", align: "left" },
      { type: "product_grid", title: "The collection", limit: 6, columns: "3" },
      { type: "feature_list", items: "Natural fibres | Cotton, wool and linen, no blends that pill.\nFree hemming | In-store, on anything we sell.\nRepairs | We fix what we sell, for a fair price." },
      { type: "testimonials", title: "Customers", limit: 3 }
    ],
    pages: [{ title: "Sizing", slug: "sizing", status: "published", sections: [
      { type: "rich_text", title: "Measurements, not vanity sizes", text: "Every product page lists flat measurements in centimetres. If you are between sizes, size up — everything is cut to allow for one wash.\n\nFree hemming is available on trousers and sleeves bought from us." }
    ] }],
    categories: [{ kind: "product", name: "Tops" }, { kind: "product", name: "Bottoms" }, { kind: "product", name: "Outerwear" }],
    products: [
      P("Heavyweight tee", "48.00", "240 gsm cotton, boxy cut. S–XXL.", "Tops", { featured: 1, variant_group: "Heavyweight tee", variant_options: "Size | S" }),
      P("Heavyweight tee", "48.00", "240 gsm cotton, boxy cut. S–XXL.", "Tops", { variant_group: "Heavyweight tee", variant_options: "Size | M" }),
      P("Heavyweight tee", "48.00", "240 gsm cotton, boxy cut. S–XXL.", "Tops", { variant_group: "Heavyweight tee", variant_options: "Size | L" }),
      P("Wool overshirt", "165.00", "Brushed wool, patch pockets.", "Outerwear", { featured: 1 }),
      P("Relaxed chino", "98.00", "Cotton twill, mid rise. Free hem.", "Bottoms", { featured: 1 }),
      P("Linen shirt", "110.00", "Washed linen, camp collar.", "Tops")
    ],
    faqs: [{ question: "Can I return an item?", answer: "Unworn, with tags, within 30 days. Hemmed items are final sale." }]
  }),

  "retail-electronics": base("Volt Electronics", {
    tagline: "Small electronics, properly explained.",
    description: "Headphones, speakers and desk gear with in-store demos and real advice.",
    category: "Electronics",
    theme: T.minimal,
    hours: HOURS.retail,
    modules: ["content", "catalog", "commerce", "payments", "inventory", "promotions", "reviews", "newsletter"],
    commerce: { pickupEnabled: 1, deliveryEnabled: 1, deliveryFeeCents: 600, deliveryFreeOverCents: 5000, onlinePayments: 1, orderPrefix: "VE-" },
    nav: nav(["Shop", "/shop"], ["Demos", "/p/demos"], ["Support", "/contact"]),
    home: [
      { type: "hero", eyebrow: "Calgary · try before you buy", title: "Listen first. Then decide.", text: "Headphones, speakers and desk gear you can actually test in the shop. No commission, no upsell.", ctaLabel: "Shop", ctaUrl: "/shop", cta2Label: "Book a demo", cta2Url: "/contact", align: "left" },
      { type: "product_grid", title: "Popular", limit: 6, columns: "3" },
      { type: "feature_list", items: "Demo bar | Twelve headphones, four speakers, always powered.\nPrice match | On any authorized Canadian retailer.\nTwo-year warranty | On everything we sell." },
      { type: "testimonials", title: "Customers", limit: 3 }
    ],
    pages: [{ title: "Demos", slug: "demos", status: "published", sections: [
      { type: "rich_text", title: "Book the listening room", text: "Thirty minutes with your own music and our headphones. Free, no obligation. Bring a playlist and a phone with your usual streaming app." }
    ] }],
    categories: [{ kind: "product", name: "Headphones" }, { kind: "product", name: "Speakers" }, { kind: "product", name: "Desk" }],
    products: [
      P("Studio headphones", "249.00", "Closed-back, replaceable pads.", "Headphones", { featured: 1 }),
      P("Wireless earbuds", "179.00", "ANC, 30-hour case.", "Headphones", { featured: 1 }),
      P("Desktop speaker pair", "329.00", "Powered, Bluetooth and USB-C.", "Speakers", { featured: 1 }),
      P("USB-C dock", "129.00", "HDMI, ethernet, 100 W passthrough.", "Desk"),
      P("Mechanical keyboard", "149.00", "Hot-swap, quiet switches.", "Desk")
    ],
    faqs: [{ question: "Do you price match?", answer: "Yes, against authorized Canadian retailers. Bring the listing." }]
  }),

  custom: base("Your Business", {
    tagline: "",
    description: "",
    category: "",
    theme: T.modern,
    hours: HOURS.office,
    modules: ["content", "catalog", "commerce", "inquiries"],
    nav: nav(["Home", "/"], ["Contact", "/contact"]),
    catalog: { productsLabel: "Products", productSingular: "Product" },
    home: [
      { type: "hero", title: "Your business, your way.", text: "Start in Business settings, then add pages, products and services. Everything here is editable.", ctaLabel: "Contact us", ctaUrl: "/contact", align: "left" },
      { type: "rich_text", title: "Built from your configuration", text: "This paragraph is a text section. Edit it in Pages, or replace it with a product grid, a gallery, a menu list or a booking prompt." }
    ],
    pages: []
  })
};

export const PRESET_GROUPS = [
  { label: "Food & beverage", keys: ["restaurant", "bakery", "coffee-shop", "food-truck", "catering"] },
  { label: "Automotive", keys: ["auto-repair", "auto-detailing", "dealership", "tire-shop"] },
  { label: "Services", keys: ["home-services", "professional-services", "consulting", "cleaning", "landscaping"] },
  { label: "Retail", keys: ["retail-general", "retail-specialty", "retail-clothing", "retail-electronics"] },
  { label: "Start blank", keys: ["custom"] }
];

export const presetList = () =>
  Object.entries(PRESETS).map(([key, p]) => ({
    key,
    name: p.business.name,
    category: p.business.category,
    tagline: p.business.tagline,
    modules: p.modules.length
  }));

export const THEMES = T;
export { HOURS };
