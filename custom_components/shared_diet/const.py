DOMAIN = "shared_diet"
STORAGE_KEY = "shared_diet.data"
STORAGE_VERSION = 1
PANEL_URL = "shared-diet"
VERSION = "0.3.6"

# Shopping categories: the house list starts with these (fixed ids). "altro" catches every unmatched food and cannot be deleted.
FALLBACK_CATEGORY = "altro"
DEFAULT_CATEGORIES = [
    {"id": "frutta_verdura", "name": "Frutta e verdura"},
    {"id": "carne", "name": "Carne"},
    {"id": "pesce", "name": "Pesce"},
    {"id": "latticini_uova", "name": "Latticini e uova"},
    {"id": "pane_forno", "name": "Pane e forno"},
    {"id": "pasta_cereali", "name": "Pasta, riso e cereali"},
    {"id": "dispensa", "name": "Dispensa"},
    {"id": "condimenti", "name": "Condimenti e spezie"},
    {"id": "surgelati", "name": "Surgelati"},
    {"id": "bevande", "name": "Bevande"},
    {"id": FALLBACK_CATEGORY, "name": "Altro"},
]

# Comma-separated keywords in fold_name form (lowercase, no accents). Multi-word keywords are fine: the longest match wins.
_KEYWORDS = {
    "frutta_verdura": (
        "frutta, verdura, verdure, mela, mele, pera, pere, banana, banane, arancia, arance, mandarino, mandarini, limone, "
        "limoni, pompelmo, kiwi, fragola, fragole, ciliegie, pesca, pesche, albicocca, albicocche, prugna, prugne, uva, "
        "melone, anguria, ananas, mango, avocado, mirtilli, lamponi, fichi, frutti di bosco, insalata, lattuga, rucola, "
        "spinaci, bietola, pomodoro, pomodori, pomodorini, zucchina, zucchine, melanzana, melanzane, peperone, peperoni, "
        "carota, carote, cipolla, cipolle, aglio, patata, patate, broccoli, cavolfiore, cavolo, verza, finocchio, finocchi, "
        "sedano, cetriolo, cetrioli, zucca, asparagi, carciofi, funghi, champignon, porro, radicchio, fagiolini, "
        "basilico, prezzemolo, rosmarino, salvia, menta"
    ),
    "carne": (
        "carne, pollo, tacchino, manzo, vitello, maiale, agnello, coniglio, bresaola, prosciutto, speck, salame, "
        "mortadella, salsiccia, salsicce, wurstel, hamburger, macinato, fesa, arrosto, bistecca, lonza, pancetta, cotoletta"
    ),
    "pesce": (
        "pesce, salmone, tonno, merluzzo, nasello, orata, branzino, spigola, sgombro, alici, acciughe, sardine, gamberi, "
        "gamberetti, calamari, polpo, seppie, cozze, vongole, platessa, sogliola, trota, baccala"
    ),
    "latticini_uova": (
        "latte, yogurt, formaggio, formaggi, mozzarella, ricotta, parmigiano, grana, pecorino, stracchino, crescenza, "
        "fiocchi di latte, burro, panna, mascarpone, scamorza, provola, fontina, gorgonzola, feta, skyr, kefir, "
        "uovo, uova, albume, albumi"
    ),
    "pane_forno": (
        "pane, panino, panini, piadina, piadine, fette biscottate, grissini, crackers, cracker, focaccia, pizza, toast, "
        "pan carre, gallette, brioche, cornetto"
    ),
    "pasta_cereali": (
        "pasta, spaghetti, penne, fusilli, rigatoni, tagliatelle, lasagne, gnocchi, riso, farro, orzo, quinoa, couscous, "
        "avena, fiocchi d avena, cereali, muesli, corn flakes, farina, polenta, miglio, grano saraceno, bulgur"
    ),
    "dispensa": (
        "legumi, fagioli, ceci, lenticchie, piselli, fave, lupini, passata, pelati, polpa di pomodoro, tonno in scatola, "
        "zucchero, miele, marmellata, confettura, cioccolato, cacao, biscotti, frutta secca, noci, mandorle, nocciole, "
        "pistacchi, arachidi, anacardi, semi, uvetta, datteri, burro di arachidi, crema spalmabile, caffe, te, tisana, "
        "proteine, whey"
    ),
    "condimenti": (
        "olio, olio evo, aceto, sale, pepe, spezie, origano, curcuma, paprika, peperoncino, cannella, noce moscata, "
        "zenzero, curry, senape, maionese, ketchup, salsa di soia, dado, brodo, lievito"
    ),
    "surgelati": "surgelati, surgelato, surgelata, surgelate, gelato, bastoncini di pesce",
    "bevande": (
        "acqua, succo, succhi, spremuta, bibita, aranciata, vino, birra, latte di soia, latte di mandorla, "
        "latte di avena, bevanda vegetale"
    ),
}
# A keyword of these categories decides wherever it is in the name ("Spinaci surgelati" -> surgelati).
QUALIFIER_CATEGORIES = {"surgelati"}
# Keyword -> default category id, matched as whole words on the folded food name (see model.category_for).
FOOD_KEYWORDS = {kw.strip(): cid for cid, words in _KEYWORDS.items() for kw in words.split(",")}
