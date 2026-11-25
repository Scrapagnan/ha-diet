DOMAIN = "shared_diet"
STORAGE_KEY = "shared_diet.data"
STORAGE_VERSION = 1
PANEL_URL = "shared-diet"
VERSION = "0.5.0"

# Shopping categories: the house list starts with these (fixed ids), in this order. "altro" catches every unmatched food
# and cannot be deleted.
FALLBACK_CATEGORY = "altro"
DEFAULT_CATEGORIES = [
    {"id": "frutta_verdura", "name": "Frutta e Verdura"},
    {"id": "panetteria", "name": "Panetteria"},
    {"id": "latte_formaggi", "name": "Latte e Formaggi"},
    {"id": "carne_pesce", "name": "Carne e Pesce"},
    {"id": "ingredienti_spezie", "name": "Ingredienti e Spezie"},
    {"id": "pronti_surgelati", "name": "Piatti pronti e Surgelati"},
    {"id": "pasta_cereali", "name": "Pasta, riso e cereali"},
    {"id": "snack_dolci", "name": "Snack e Dolci"},
    {"id": "bevande", "name": "Bevande"},
    {"id": "casa", "name": "Casa"},
    {"id": "bellezza_igiene", "name": "Bellezza e Igiene"},
    {"id": "animali", "name": "Animali"},
    {"id": "fai_da_te", "name": "Fai da te e Giardino"},
    {"id": FALLBACK_CATEGORY, "name": "Altro"},
]

# Comma-separated keywords in fold_name form (lowercase, no accents). Multi-word keywords are fine.
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
    "panetteria": (
        "pane, panino, panini, piadina, piadine, fette biscottate, grissini, crackers, cracker, focaccia, pizza, toast, "
        "pan carre, gallette, brioche, cornetto, cornetti, pangrattato, taralli"
    ),
    "latte_formaggi": (
        "latte, yogurt, formaggio, formaggi, mozzarella, ricotta, parmigiano, grana, pecorino, stracchino, crescenza, "
        "fiocchi di latte, burro, panna, mascarpone, scamorza, provola, fontina, gorgonzola, feta, skyr, kefir, "
        "uovo, uova, albume, albumi"
    ),
    "carne_pesce": (
        "carne, pollo, tacchino, manzo, vitello, maiale, agnello, coniglio, bresaola, prosciutto, speck, salame, "
        "mortadella, salsiccia, salsicce, wurstel, hamburger, macinato, fesa, arrosto, bistecca, lonza, pancetta, cotoletta, "
        "pesce, salmone, tonno, merluzzo, nasello, orata, branzino, spigola, sgombro, alici, acciughe, sardine, gamberi, "
        "gamberetti, calamari, polpo, seppie, cozze, vongole, platessa, sogliola, trota, baccala"
    ),
    "ingredienti_spezie": (
        "olio, olio evo, aceto, sale, pepe, spezie, origano, curcuma, paprika, peperoncino, cannella, noce moscata, "
        "zenzero, curry, senape, maionese, ketchup, salsa di soia, dado, brodo, lievito, zucchero, miele, "
        "legumi, fagioli, ceci, lenticchie, piselli, fave, lupini, passata, pelati, polpa di pomodoro, tonno in scatola, "
        "semi, proteine, whey"
    ),
    # "pronto"/"surgelato" decide wherever they are in the name: see QUALIFIER_CATEGORIES.
    "pronti_surgelati": (
        "surgelati, surgelato, surgelata, surgelate, gelato, gelati, bastoncini di pesce, pronto, pronta, pronti, pronte, "
        "piatto pronto, sugo pronto, zuppa, minestrone"
    ),
    "pasta_cereali": (
        "pasta, spaghetti, penne, fusilli, rigatoni, tagliatelle, lasagne, gnocchi, riso, farro, orzo, quinoa, couscous, "
        "avena, fiocchi d avena, cereali, muesli, corn flakes, farina, polenta, miglio, grano saraceno, bulgur"
    ),
    "snack_dolci": (
        "biscotti, cioccolato, cioccolata, cacao, marmellata, confettura, crema spalmabile, burro di arachidi, merendine, "
        "merendina, patatine, snack, caramelle, barretta, barrette, wafer, torta, crostata, frutta secca, noci, mandorle, "
        "nocciole, pistacchi, arachidi, anacardi, uvetta, datteri, popcorn"
    ),
    "bevande": (
        "acqua, succo, succhi, spremuta, bibita, bibite, aranciata, cola, vino, birra, latte di soia, latte di mandorla, "
        "latte di avena, bevanda vegetale, caffe, te, tisana, camomilla"
    ),
    "casa": (
        "detersivo, detersivi, ammorbidente, candeggina, sgrassatore, anticalcare, spugna, spugne, carta igienica, "
        "carta cucina, carta forno, alluminio, pellicola, sacchetti, sacchi, tovaglioli, scottex, piatti di carta, "
        "bicchieri di plastica, pastiglie lavastoviglie"
    ),
    "bellezza_igiene": (
        "shampoo, balsamo, bagnoschiuma, docciaschiuma, sapone, dentifricio, spazzolino, collutorio, deodorante, "
        "crema viso, crema corpo, crema mani, assorbenti, rasoio, lamette, cotone, cotton fioc, cerotti, salviette, "
        "fazzoletti, struccante, profumo"
    ),
    "animali": "crocchette, scatolette, lettiera, cane, cani, gatto, gatti, croccantini, antiparassitario",
    "fai_da_te": (
        "lampadina, lampadine, pile, batterie, viti, chiodi, colla, nastro adesivo, vernice, pennello, terriccio, "
        "concime, fertilizzante, vaso, vasi, piante, fiori, attrezzi"
    ),
}
# A keyword of these categories decides wherever it is in the name ("Spinaci surgelati", "Insalata pronta").
QUALIFIER_CATEGORIES = {"pronti_surgelati"}
# Keyword -> default category id, matched as whole words on the folded food name (see model.category_for).
FOOD_KEYWORDS = {kw.strip(): cid for cid, words in _KEYWORDS.items() for kw in words.split(",")}
