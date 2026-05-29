// Default menu data, served when KV has no entry for a given slug.
//
// One record per slug; the shape mirrors what /admin/save writes.
// Keep alphabetical-ish grouping (HE / EN pairs together).

export interface MenuItem    {
  name: string;
  description: string;
  price: string;
  /** When true, this item is chosen to appear on the home page cinematic
   *  strip (up to 5 per category). When no items in a category are featured,
   *  the home page falls back to showing the first N as before. */
  featured?: boolean;
}
export interface MenuSection { title: string; items: MenuItem[]; }

export const DEFAULT_SECTIONS: Record<string, MenuSection[]> = {
  he: [
    { title: 'משהו להתחלה', items: [
      { name: 'הלחם שלנו',           description: 'איולי לימון שרוף, פלפל שושקה בחומץ יין לבן, חצילים ומיסו',                                   price: '32'    },
      { name: 'צלחת חריפים',         description: "צ'ילי, חלפיניו, דבש צ'ילי, קרם עגבניות שרי, זיתים",                                           price: '24'    },
      { name: 'מרק ארטישוק ירושלמי', description: "פטריות פורצ'יני, שורשים לבנים, ערמונים",                                                      price: '58'    },
      { name: 'סלט עלים',            description: "בייבי צ'יק, לאליק, קייל, בצל שאלוט, הדרים, פיסטוק מסוכר, וויניגרט מנגו-פסיפלורה",           price: '64'    },
      { name: 'סשימי דג ים',         description: "רוטב קלמנטינות למון גראס וצ'ילי, פינגר ליים ופירות הדר",                                      price: '78/88' },
      { name: "סביצ'ה סלמון",        description: "גספצ'ו תפוח, סלרי ומלפפון, שאלוט, צ'ילי, ליים",                                               price: '72'    },
      { name: 'רוסטביף',             description: "ברוסקטה, איולי צלפים, זרעי עגבנייה, קורנישונים",                                              price: '68'    },
      { name: 'טרטר בקר',            description: "שייטל, קרקר קימל ואגוזי מלך, איולי חזרת צ'ילי, שאלוט, עירית",                                 price: '78'    },
    ]},
    { title: 'ממשיכים', items: [
      { name: 'נאגטס דלעת ערמונים', description: 'בטמפורה עם איולי פלפלים מעושנים',                                                              price: '68'  },
      { name: 'פטריית ירדן',         description: 'בתנור פחמים, קרמל סויה, קרם קשיו, גרידת הדרים',                                               price: '76'  },
      { name: 'כבד אווז',            description: "לחם קסטן, ריבת תפוחי עץ, ג'ינג'ר, רוטב יין אדום",                                            price: '124' },
      { name: 'סלט שוק אווז',        description: "פפאיה, בטטה לבנה, עלים, בצל סגול, צ'ילי, בוטנים, בוויניגרט תמרהינדי",                        price: '82'  },
    ]},
    { title: 'כמעט הגענו', items: [
      { name: 'שיפוד אנטרקוט',      description: 'בתנור פחמים, רוטב חלפיניו, כוסברה וליים, רוטב יין אדום',                                       price: '142' },
      { name: 'פילה דג',             description: "דג ים, ריזוטו פטריות, יין לבן, ציר פורצ'יני",                                                 price: '152' },
      { name: 'חזה אווז',            description: 'קרם סלק ותפוחים, סלקים צלויים, ציר ברווז',                                                     price: '136' },
      { name: 'שייטל',               description: 'בתנור פחמים, קרם בטטה לבנה, דמי גלאס, ירוקים',                                                price: '154' },
      { name: "אנטריקוט 250ג'",      description: "תפוח אדמה צלוי, צ'ימיצ'ורי ודמי גלאס",                                                        price: '210' },
      { name: 'פיקנייה',             description: 'כרישה קונפי, גזרים צבעוניים, קרם ארטישוק ירושלמי ושורשים',                                    price: '165' },
    ]},
    { title: 'לצד הדרך', items: [
      { name: "צ'יפס גראטן",        description: 'שמן זית, איולי חזרת ולימון',                                                                   price: '48' },
      { name: 'כרוב',               description: 'צלוי בתנור, קרם קשיו ושקדים',                                                                  price: '46' },
      { name: 'סטייק דלעת נאפולי',  description: 'צלוי בתנור, שמן זית, טימין, סויה',                                                             price: '38' },
      { name: 'ירוקים',             description: "באק צ'וי, זוקיני, שעועית רחבה ותרד בויניגרט לימוני",                                            price: '36' },
    ]},
  ],

  en: [
    { title: 'Beginnings', items: [
      { name: 'Artisanal Bread',          description: 'charred lemon aioli, shishito pepper in white-wine vinegar, eggplant & miso',                            price: '32'    },
      { name: 'Assorted Peppers',         description: 'red chili, jalapeño, harissa, yellow tomato cream, olives',                                               price: '24'    },
      { name: 'Jerusalem Artichoke Soup', description: 'porcini mushrooms, white roots, chestnuts',                                                               price: '58'    },
      { name: 'Leaf Salad',               description: 'mizuna, kale, oxalis, radish, citrus, caramelized pistachio, red onion, mango-passionfruit vinaigrette', price: '64'    },
      { name: 'Sea Fish Sashimi',         description: 'clementine, pomelo, lemongrass-chili sauce, finger lime',                                                 price: '78/88' },
      { name: 'Salmon Ceviche',           description: 'apple, celery & cucumber gazpacho, shallot, chili, lime',                                                 price: '72'    },
      { name: 'Roast Beef',               description: 'bruschetta, caper aioli, tomato seeds, pickles',                                                          price: '68'    },
      { name: 'Beef Tartare',             description: 'rump steak, caraway-walnut cracker, chili-horseradish aioli, shallots, chives',                          price: '78'    },
    ]},
    { title: 'Progressions', items: [
      { name: 'Chestnut Pumpkin Nuggets', description: 'tempura, togarashi, smoked pepper aioli',                                                          price: '68'  },
      { name: 'Oyster Mushroom',          description: 'in charcoal, soy caramel sauce, chili, citrus, cashew cream',                                      price: '76'  },
      { name: 'Goose Liver',              description: 'caston bread, apple-ginger jam, demi-glace',                                                       price: '124' },
      { name: 'Crispy Goose Leg Salad',   description: 'mango, white sweet potato, greens, red onion, chili, peanuts, tamarind vinaigrette',               price: '82'  },
    ]},
    { title: 'Almost There', items: [
      { name: 'Entrecôte Skewer', description: 'in charcoal, jalapeño cream, coriander, lime demi-glace',           price: '142' },
      { name: 'Fish Fillet',      description: 'sea fish, mushroom risotto, white wine, porcini broth',             price: '152' },
      { name: 'Goose Breast',     description: 'beetroot-apple cream, roasted beets, duck demi-glace',              price: '136' },
      { name: 'Rump Steak',       description: 'in charcoal, white potato cream, demi-glace, greens',               price: '154' },
      { name: 'Entrecôte 250g',   description: 'roasted potato, chimichurri, demi-glace',                           price: '210' },
      { name: 'Picanha Steak',    description: 'confit leek, colorful carrots, Jerusalem artichoke cream and roots',price: '165' },
    ]},
    { title: 'Side Notes', items: [
      { name: 'Potato Gratin',            description: 'olive oil, horseradish & lemon aioli',                            price: '48' },
      { name: 'Cabbage',                  description: 'oven roasted, cashew & almond cream',                             price: '46' },
      { name: 'Neapolitan Pumpkin Steak', description: 'oven roasted, olive oil, thyme, soy',                            price: '38' },
      { name: 'Green Vegetables',         description: 'bok choy, broad beans, zucchini, spinach in lemon vinaigrette',  price: '36' },
    ]},
  ],

  dessert: [
    { title: 'קינוחים', items: [
      { name: 'שוקולד',              description: 'קרמו שוקולד, רוטב שוקולד קרמל, פקאן, טוויל שוקולד, קרמבל בוטנים',          price: '58' },
      { name: 'קרמו פסיפלורה ומנגו', description: "קולי פירות יער, ג'לי תותים ושוקולד לבן, טויל מנגו, רוטב פסיפלורה ווניל",  price: '56' },
      { name: 'קרם לימון',           description: 'יוזו, מרנג, סירופ תותים ואוכמניות, טוויל תות',                             price: '56' },
      { name: 'פיסטוק',              description: 'מוס פיסטוק ושוקולד לבן, טוויל פיסטוק, קרמבל שוקולד לבן, קולי אוכמניות',   price: '58' },
    ]},
    { title: 'שתייה חמה', items: [
      { name: 'קנקן תה',     description: "נענע מרוקאית, יסמין, ירוק סנצ'ה, צ'אי הודי, לימונית לואיזה, אינגליש ברקפסט, קמומיל", price: '15' },
      { name: 'אספרסו',      description: '', price: '12' },
      { name: 'אספרסו כפול', description: '', price: '14' },
    ]},
    { title: "דג'סטיף", items: [
      { name: "לימונצ'לו די קפרי", description: '', price: '21/38' },
      { name: 'בחרובקה',           description: '', price: '24/42' },
      { name: 'פרנה ברנקה',        description: '', price: '22/44' },
      { name: 'אמארו מונטנגרו',    description: '', price: '23/44' },
    ]},
    { title: 'יין קינוח', items: [
      { name: 'הר חברון, יין אייס, עדן', description: '', price: '24' },
      { name: 'כרמל, פורט מעליא',        description: '', price: '25' },
      { name: 'פורט הר ברכה',            description: '', price: '28' },
      { name: 'פורט הר אודם',            description: '', price: '35' },
    ]},
    { title: 'גראפה / או דה וי', items: [
      { name: 'יוליוס, בלאן דה גליליי',     description: '', price: '42' },
      { name: 'יוליוס, מאר דה גליליי',      description: '', price: '42' },
      { name: 'וודרן, או דה וי שזיף מיושן', description: '', price: '57' },
      { name: 'יוליוס, או דה וי תות',       description: '', price: '52' },
      { name: 'יוליוס, או דה וי משמש',      description: '', price: '52' },
    ]},
  ],

  dessert_en: [
    { title: 'Desserts', items: [
      { name: 'Chocolate',            description: 'chocolate cremeux, caramel chocolate sauce, pecan, chocolate tuile, peanut crumble',                            price: '58' },
      { name: 'Passionfruit & Mango', description: 'berry coulis, strawberry jelly and white chocolate, mango tuile, passionfruit-vanilla sauce',                   price: '56' },
      { name: 'Lemon Cream',          description: 'yuzu, meringue, strawberry & blueberry syrup, strawberry tuile',                                                price: '56' },
      { name: 'Pistachio',            description: 'pistachio and white chocolate mousse, pistachio tuile, white chocolate crumble, blueberry coulis',              price: '58' },
    ]},
    { title: 'Hot Drinks', items: [
      { name: 'Tea Pot',         description: 'Moroccan mint, jasmine, green sencha, Indian chai, lemon verbena, English breakfast, chamomile', price: '15' },
      { name: 'Espresso',        description: '', price: '12' },
      { name: 'Double Espresso', description: '', price: '14' },
    ]},
    { title: 'Digestif', items: [
      { name: 'Limoncello di Capri', description: '', price: '21/38' },
      { name: 'Becherovka',          description: '', price: '24/42' },
      { name: 'Fernet Branca',       description: '', price: '22/44' },
      { name: 'Amaro Montenegro',    description: '', price: '23/44' },
    ]},
    { title: 'Dessert Wine', items: [
      { name: 'Har Hebron, Ice Wine, Eden', description: '', price: '24' },
      { name: 'Carmel, Porto Mealia',       description: '', price: '25' },
      { name: 'Port Har Bracha',            description: '', price: '28' },
      { name: 'Port Har Odem',              description: '', price: '35' },
    ]},
    { title: 'Grappa / Eau de Vie', items: [
      { name: 'Julius, Blanc de Galilée',     description: '', price: '42' },
      { name: 'Julius, Marc de Galilée',      description: '', price: '42' },
      { name: 'Wodran, Eau de Vie aged plum', description: '', price: '57' },
      { name: 'Julius, Eau de Vie strawberry',description: '', price: '52' },
      { name: 'Julius, Eau de Vie apricot',   description: '', price: '52' },
    ]},
  ],

  // Wine prices: single number = bottle only; "200/52" = bottle / glass.
  wine: [
    { title: 'מבעבע', items: [
      { name: 'ירדן, בלאן דה בלאן, 2019', description: 'רמת הגולן',    price: '270'    },
      { name: 'ירדן, ברוט רוזה, 2019',     description: 'רמת הגולן',    price: '270'    },
      { name: 'מרטיני, אסטי',               description: 'איטליה',       price: '170/42' },
      { name: 'לורן-פרייה, ברוט',           description: 'שמפיין, צרפת', price: '780'    },
    ]},
    { title: 'לבן', items: [
      { name: 'פסגות, ויונייה, 2023',                    description: 'הרי ירושלים',     price: '200/52' },
      { name: 'דומיין דה וירבאן, שאבלי, 2024',           description: 'בורגונדי, צרפת',  price: '220/55' },
      { name: 'גבעות, גופנה, שרדונה-קברנה, 2022',        description: 'גבעת הראל',       price: '215/54' },
      { name: 'פסגות, סוביניון בלאן, 2024',              description: 'הרי ירושלים',     price: '185'    },
      { name: 'פסגות, שרדונה, 2024',                      description: 'הרי ירושלים',     price: '180'    },
      { name: 'פסגות, גוורצטרמינר, 2023',                 description: 'הרי ירושלים',     price: '170'    },
      { name: 'עמק האלה, שנין בלאן, 2024',                description: 'עמק האלה',        price: '170'    },
      { name: 'לוריא, שרדונה ללא חבית, 2024',             description: 'גליל עליון',      price: '170'    },
      { name: 'בנימינה, ברקת, סוביניון בלאן, 2024',       description: 'בנימינה',         price: '210'    },
      { name: 'בנימינה, שוהם, שרדונה, 2021',              description: 'בנימינה',         price: '210'    },
      { name: 'יתיר, חלוץ לבן, שנין-רוסאן, 2022',         description: 'נגב',             price: '210'    },
      { name: 'בת שלמה, סוביניון בלאן, 2025',             description: 'מורדות הכרמל',    price: '230'    },
      { name: 'גבעות, גופנה, סוביניון בלאן, 2024',        description: 'גבעת הראל',       price: '210'    },
    ]},
    { title: 'רוזה', items: [
      { name: 'פסגות, PR, רוזה, 2024',                 description: 'הרי ירושלים',      price: '190/50' },
      { name: 'גבעות, גופנה, רוזה, 2024',              description: 'גבעת הראל',        price: '190'    },
      { name: "שאטו ד'אסקאלן, Whispering Angel, 2024", description: 'פרובאנס, צרפת',    price: '200'    },
    ]},
    { title: 'אדום', items: [
      { name: 'רמת חברון, יצחק רם, קברנה סוביניון, 2023', description: 'הרי יהודה',     price: '220/55' },
      { name: 'כמיסה, פטיט סירה, 2024',                    description: 'גליל עליון',    price: '215/53' },
      { name: 'פסגות, קברנה פרנק, 2024',                   description: 'הרי ירושלים',   price: '220/55' },
      { name: 'עמק האלה, Red Head, בלנד, 2023',           description: 'עמק האלה',      price: '260'    },
      { name: 'עמק האלה, אסטייט, מרלו, 2023',              description: 'עמק האלה',      price: '190'    },
      { name: 'עמק האלה, מזמור, בלנד, 2023',               description: 'עמק האלה',      price: '260'    },
      { name: 'פסגות, פיק, בלנד, 2023',                    description: 'הרי ירושלים',   price: '290'    },
      { name: 'פסגות, מולדת, בלנד, 2023',                  description: 'הרי ירושלים',   price: '290'    },
      { name: 'יתיר, נחל יתיר, בלנד, 2021',                description: 'נגב',           price: '320'    },
      { name: 'יתיר, פטי ורדו, 2022',                      description: 'נגב',           price: '315'    },
      { name: 'יתיר, בצל העלווה, G.S.M, 2021',             description: 'נגב',           price: '370'    },
      { name: 'יתיר, יער יתיר, בלנד, 2021',                description: 'נגב',           price: '680'    },
      { name: 'בת שלמה, אלכמי, בלנד, 2022',                description: 'מורדות הכרמל',  price: '305'    },
      { name: "בת שלמה, Betty's Cuvée, בלנד, 2020",        description: 'מורדות הכרמל',  price: '410'    },
      { name: 'שילה, שור, קברנה סוביניון, 2023',           description: 'שילה',          price: '190'    },
      { name: 'שילה, סוד, קברנה סוביניון, 2023',           description: 'שילה',          price: '300'    },
      { name: 'גבעות, מחול הכרמים, בלנד, 2023',            description: 'גבעת הראל',     price: '215'    },
      { name: 'גבעות, גופנה, פטי ורדו, 2023',              description: 'גבעת הראל',     price: '280'    },
      { name: 'גבעות, קברנה סוביניון, 2022',               description: 'גבעת הראל',     price: '280'    },
      { name: 'גבעות, מצדה, בלנד, 2021',                   description: 'גבעת הראל',     price: '450'    },
      { name: 'בנימינה, שבא, קברנה סוביניון, 2022',        description: 'בנימינה',       price: '205'    },
      { name: 'בנימינה, תרשיש, קברנה סוביניון, 2023',      description: 'בנימינה',       price: '210'    },
      { name: 'צרעה, הרי יהודה, בלנד, 2024',               description: 'הרי יהודה',     price: '250'    },
      { name: 'צרעה, שורש, בלנד, 2024',                    description: 'הרי יהודה',     price: '285'    },
      { name: 'צרעה, מיסטי הילס, בלנד, 2023',              description: 'הרי יהודה',     price: '630'    },
      { name: 'רמת חברון, מכפלה, בלנד, 2020',              description: 'הרי יהודה',     price: '390'    },
      { name: 'רמת חברון, פרדס, מרלו, 2021',               description: 'הרי יהודה',     price: '220'    },
      { name: 'רמת חברון, ארמגדון, בלנד, 2018',            description: 'הרי יהודה',     price: '780'    },
      { name: 'הרי גליל, יראון, כרם יחידני, 2022',         description: 'גליל עליון',    price: '240'    },
      { name: 'רמת הגולן, קברנה סוביניון, 2022',           description: 'רמת הגולן',     price: '250'    },
      { name: "כרמל, סיגנצ'ר, Mediterranean, בלנד",        description: 'בנימינה',       price: '295'    },
      { name: 'לוריא, ברברה, 2022',                        description: 'גליל עליון',    price: '230'    },
      { name: 'דלתון, קברנה סוביניון אלקוש',               description: 'גליל עליון',    price: '270'    },
      { name: 'דלתון, Coast to Coast, זינפנדל, 2023',      description: 'גליל עליון',    price: '200'    },
    ]},
    { title: 'מתיישנים', items: [
      { name: 'גבעות, מצדה, בלנד, 2020',     description: 'גבעת הראל', price: '560'  },
      { name: 'גבעות, מצדה, בלנד, 2019',     description: 'גבעת הראל', price: '725'  },
      { name: 'גבעות, רז, בלנד, 2020',       description: 'גבעת הראל', price: '950'  },
      { name: 'יתיר, יער יתיר, בלנד, 2014',  description: 'נגב',       price: '2200' },
    ]},
  ],

  wine_en: [
    { title: 'Sparkling', items: [
      { name: 'Yarden, Blanc de Blancs, 2019', description: 'Golan Heights',     price: '270'    },
      { name: 'Yarden, Brut Rosé, 2019',       description: 'Golan Heights',     price: '270'    },
      { name: 'Martini, Asti',                 description: 'Italy',             price: '170/42' },
      { name: 'Laurent-Perrier, Brut',         description: 'Champagne, France', price: '780'    },
    ]},
    { title: 'White', items: [
      { name: 'Pesgot, Viognier, 2023',                         description: 'Judean Hills',      price: '200/52' },
      { name: 'Domaine de Vauroux, Chablis, 2024',              description: 'Burgundy, France',  price: '220/55' },
      { name: "Gva'ot, Gofna, Chardonnay-Cabernet, 2022",       description: "Gva'ot HaRa'el",    price: '215/54' },
      { name: 'Pesgot, Sauvignon Blanc, 2024',                  description: 'Judean Hills',      price: '185'    },
      { name: 'Pesgot, Chardonnay, 2024',                       description: 'Judean Hills',      price: '180'    },
      { name: 'Pesgot, Gewürztraminer, 2023',                   description: 'Judean Hills',      price: '170'    },
      { name: 'Ella Valley, Chenin Blanc, 2024',                description: 'Ella Valley',       price: '170'    },
      { name: 'Lueria, Unoaked Chardonnay, 2024',               description: 'Upper Galilee',     price: '170'    },
      { name: 'Binyamina, Bareket, Sauvignon Blanc, 2024',      description: 'Binyamina',         price: '210'    },
      { name: 'Binyamina, Shoham, Chardonnay, 2021',            description: 'Binyamina',         price: '210'    },
      { name: 'Yatir, Halutz Lavan, Chenin-Roussanne, 2022',    description: 'Negev',             price: '210'    },
      { name: 'Bat Shlomo, Sauvignon Blanc, 2025',              description: 'Mt. Carmel slopes', price: '230'    },
      { name: "Gva'ot, Gofna, Sauvignon Blanc, 2024",           description: "Gva'ot HaRa'el",    price: '210'    },
    ]},
    { title: 'Rosé', items: [
      { name: 'Pesgot, PR, Rosé, 2024',                    description: 'Judean Hills',       price: '190/50' },
      { name: "Gva'ot, Gofna, Rosé, 2024",                 description: "Gva'ot HaRa'el",     price: '190'    },
      { name: "Château d'Esclans, Whispering Angel, 2024", description: 'Provence, France',   price: '200'    },
    ]},
    { title: 'Red', items: [
      { name: 'Ramat Hebron, Yitzhak Ram, Cabernet Sauvignon, 2023', description: 'Judean Mountains',  price: '220/55' },
      { name: 'Kamisa, Petite Sirah, 2024',                          description: 'Upper Galilee',     price: '215/53' },
      { name: 'Pesgot, Cabernet Franc, 2024',                        description: 'Judean Hills',      price: '220/55' },
      { name: 'Ella Valley, Red Head, Blend, 2023',                  description: 'Ella Valley',       price: '260'    },
      { name: 'Ella Valley, Estate, Merlot, 2023',                   description: 'Ella Valley',       price: '190'    },
      { name: 'Ella Valley, Mizmor, Blend, 2023',                    description: 'Ella Valley',       price: '260'    },
      { name: 'Pesgot, Peak, Blend, 2023',                           description: 'Judean Hills',      price: '290'    },
      { name: 'Pesgot, Moledet, Blend, 2023',                        description: 'Judean Hills',      price: '290'    },
      { name: 'Yatir, Nahal Yatir, Blend, 2021',                     description: 'Negev',             price: '320'    },
      { name: 'Yatir, Petit Verdot, 2022',                           description: 'Negev',             price: '315'    },
      { name: "Yatir, Be'tsel Ha'aleva, G.S.M, 2021",                description: 'Negev',             price: '370'    },
      { name: 'Yatir, Yatir Forest, Blend, 2021',                    description: 'Negev',             price: '680'    },
      { name: 'Bat Shlomo, Alchemy, Blend, 2022',                    description: 'Mt. Carmel slopes', price: '305'    },
      { name: "Bat Shlomo, Betty's Cuvée, Blend, 2020",              description: 'Mt. Carmel slopes', price: '410'    },
      { name: 'Shilo, Shor, Cabernet Sauvignon, 2023',               description: 'Shilo',             price: '190'    },
      { name: 'Shilo, Sod, Cabernet Sauvignon, 2023',                description: 'Shilo',             price: '300'    },
      { name: "Gva'ot, Mehol HaKramim, Blend, 2023",                 description: "Gva'ot HaRa'el",    price: '215'    },
      { name: "Gva'ot, Gofna, Petit Verdot, 2023",                   description: "Gva'ot HaRa'el",    price: '280'    },
      { name: "Gva'ot, Cabernet Sauvignon, 2022",                    description: "Gva'ot HaRa'el",    price: '280'    },
      { name: "Gva'ot, Masada, Blend, 2021",                         description: "Gva'ot HaRa'el",    price: '450'    },
      { name: 'Binyamina, Sheva, Cabernet Sauvignon, 2022',          description: 'Binyamina',         price: '205'    },
      { name: 'Binyamina, Tarshish, Cabernet Sauvignon, 2023',       description: 'Binyamina',         price: '210'    },
      { name: 'Tzora, Judean Hills, Blend, 2024',                    description: 'Judean Mountains',  price: '250'    },
      { name: 'Tzora, Shoresh, Blend, 2024',                         description: 'Judean Mountains',  price: '285'    },
      { name: 'Tzora, Misty Hills, Blend, 2023',                     description: 'Judean Mountains',  price: '630'    },
      { name: 'Ramat Hebron, Machpela, Blend, 2020',                 description: 'Judean Mountains',  price: '390'    },
      { name: 'Ramat Hebron, Pardes, Merlot, 2021',                  description: 'Judean Mountains',  price: '220'    },
      { name: 'Ramat Hebron, Armagedon, Blend, 2018',                description: 'Judean Mountains',  price: '780'    },
      { name: 'Galil Mountain, Yiron, Single Vineyard, 2022',        description: 'Upper Galilee',     price: '240'    },
      { name: 'Golan Heights, Cabernet Sauvignon, 2022',             description: 'Golan Heights',     price: '250'    },
      { name: 'Carmel, Signature, Mediterranean, Blend',             description: 'Binyamina',         price: '295'    },
      { name: 'Lueria, Barbera, 2022',                                description: 'Upper Galilee',    price: '230'    },
      { name: 'Dalton, Cabernet Sauvignon Alkosh',                    description: 'Upper Galilee',    price: '270'    },
      { name: 'Dalton, Coast to Coast, Zinfandel, 2023',              description: 'Upper Galilee',    price: '200'    },
    ]},
    { title: 'Cellar', items: [
      { name: "Gva'ot, Masada, Blend, 2020",      description: "Gva'ot HaRa'el", price: '560'  },
      { name: "Gva'ot, Masada, Blend, 2019",      description: "Gva'ot HaRa'el", price: '725'  },
      { name: "Gva'ot, Raz, Blend, 2020",         description: "Gva'ot HaRa'el", price: '950'  },
      { name: 'Yatir, Yatir Forest, Blend, 2014', description: 'Negev',          price: '2200' },
    ]},
  ],

  // Cocktails are bilingual: description holds "EN line · HE line" and is split on render.
  cocktails: [
    { title: 'Signature Cocktails', items: [
      { name: 'Floriesse',        description: 'Citrus Vodka, Passion Fruit, Pineapple, Coconut, Basil & Lemon · וודקה הדרים, פסיפלורה, אננס, קוקוס, בזיליקום ולימון',                                   price: '58' },
      { name: 'Oasis',            description: 'Reposado Tequila, Amaro Montenegro, Blood Orange, Clementine, Orgeat & Lemon · טקילה רפוסדו, אמארו מונטנגרו, מחית תפוז דם, קלמנטינה, סירופ שקדים ולימון', price: '58' },
      { name: 'Rosette',          description: 'Bombay Sapphire, Elderflower, Raspberry-Vanilla syrup, Basil & Lemon · בומביי ספייר, אלדרפלאוור, סירופ פטל-וניל, בזיליקום ולימון',                       price: '56' },
      { name: 'Monsoon',          description: 'Calvados, Dark Rum, Falernum, Guava, Allspice syrup, Lemon & Bitters · ברנדי תפוחים, רום כהה, גויאבה, סירופ תבלינים, לימון וביטרים',                      price: '58' },
      { name: 'Lumina',           description: "Pear Vodka, Elderflower, Granny Smith Apple, Ginger syrup, Lemon & Mint · וודקה אגסים, אלדרפלאוור, תפוח גראני סמית', סירופ ג'ינג'ר, לימון ונענע",     price: '58' },
      { name: 'White Mirage',     description: 'Bombay Sapphire, Crème de Cacao White, White Vermouth, Peach & Lemon · בומביי ספייר, קרם דה קקאו לבן, ורמוט לבן, אפרסק ולימון',                          price: '56' },
      { name: 'Zahara Spritz',    description: 'Aperol, Vermouth Sec de Galilée, Peach, Lime, Cava, Soda & Rose water · אפרול, ורמוט סק דה גליליי, מחית אפרסק, לימון, קאווה, סודה ומי ורדים',            price: '52' },
      { name: 'Margarita',        description: 'Milagro Silver, Cointreau, Agave, Lemon & Togarashi rim · מילאגרו סילבר, קוואנטרו, מיץ לימון, אגאבה וכתר טוגראשי',                                        price: '56' },
      { name: 'Espresso Martini', description: "Belvedere, Frangelico, Espresso, Crème de Cacao & Sugar · בלוודיר, פרנג'ליקו, אספרסו, קרם דה קקאו וסוכר",                                                 price: '56' },
    ]},
  ],

  events:    [],
  events_en: [],
};
