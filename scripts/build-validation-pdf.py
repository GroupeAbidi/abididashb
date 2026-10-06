from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    BaseDocTemplate, Frame, Image, LongTable, PageTemplate, Paragraph,
    PageBreak, Spacer, Table, TableStyle, KeepTogether
)

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "validation-calculs-dashboard-minoterie.pdf"
LOGO = ROOT / "public" / "brand" / "groupe-abidi-logo.png"

RED = colors.HexColor("#7A3024")
GOLD = colors.HexColor("#C99715")
DARK = colors.HexColor("#211C1A")
GREEN = colors.HexColor("#3F6F68")
PAPER = colors.HexColor("#FAF7F1")
LINE = colors.HexColor("#DED5C9")
MUTED = colors.HexColor("#756B65")
ALERT = colors.HexColor("#A33C2E")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=27, leading=31, textColor=DARK, alignment=TA_CENTER, spaceAfter=8))
styles.add(ParagraphStyle(name="CoverSub", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=RED, alignment=TA_CENTER, spaceAfter=16))
styles.add(ParagraphStyle(name="H1x", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=RED, spaceBefore=10, spaceAfter=9))
styles.add(ParagraphStyle(name="H2x", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=DARK, spaceBefore=7, spaceAfter=6))
styles.add(ParagraphStyle(name="Bodyx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=13, textColor=DARK, spaceAfter=5))
styles.add(ParagraphStyle(name="Smallx", parent=styles["BodyText"], fontName="Helvetica", fontSize=7.5, leading=10, textColor=MUTED))
styles.add(ParagraphStyle(name="Boxx", parent=styles["BodyText"], fontName="Helvetica", fontSize=8.7, leading=12, textColor=DARK))
styles.add(ParagraphStyle(name="Formulax", parent=styles["Code"], fontName="Courier", fontSize=8.4, leading=11, textColor=DARK, leftIndent=5, rightIndent=5))
styles.add(ParagraphStyle(name="Centerx", parent=styles["BodyText"], fontName="Helvetica", fontSize=9, leading=12, alignment=TA_CENTER, textColor=DARK))


def p(text, style="Bodyx"):
    return Paragraph(text, styles[style])


def bullet(text):
    return Paragraph(f"- {text}", styles["Bodyx"])


def formula(*lines):
    text = "<br/>".join(lines)
    box = Table([[Paragraph(text, styles["Formulax"])]], colWidths=[16.2 * cm])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PAPER),
        ("BOX", (0, 0), (-1, -1), 0.8, GOLD),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return box


def callout(title, text, color=GREEN):
    content = Paragraph(f"<b>{title}</b><br/>{text}", styles["Boxx"])
    box = Table([[content]], colWidths=[16.2 * cm])
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.Color(color.red, color.green, color.blue, alpha=0.07)),
        ("BOX", (0, 0), (-1, -1), 0.8, color),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return box


def data_table(rows, widths, header=True, font_size=8):
    converted = [[cell if hasattr(cell, "wrap") else p(str(cell), "Smallx") for cell in row] for row in rows]
    table = LongTable(converted, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]
    if header:
        commands += [("BACKGROUND", (0, 0), (-1, 0), RED), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white), ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold")]
    for row in range(1 if header else 0, len(rows)):
        if row % 2 == 0:
            commands.append(("BACKGROUND", (0, row), (-1, row), PAPER))
    table.setStyle(TableStyle(commands))
    return table


class ReportDoc(BaseDocTemplate):
    pass


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.4)
    canvas.line(2 * cm, A4[1] - 1.45 * cm, A4[0] - 2 * cm, A4[1] - 1.45 * cm)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.setFillColor(RED)
    canvas.drawString(2 * cm, A4[1] - 1.15 * cm, "GROUPE ABIDI")
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawRightString(A4[0] - 2 * cm, A4[1] - 1.15 * cm, "Validation Dashboard Minoterie")
    canvas.line(2 * cm, 1.35 * cm, A4[0] - 2 * cm, 1.35 * cm)
    canvas.drawString(2 * cm, 0.95 * cm, "Version de travail - Juillet 2026")
    canvas.drawRightString(A4[0] - 2 * cm, 0.95 * cm, f"Page {doc.page}")
    canvas.restoreState()


def h1(title):
    return p(title, "H1x")


def h2(title):
    return p(title, "H2x")


story = []

# Cover
story.append(Spacer(1, 1.0 * cm))
if LOGO.exists():
    img = Image(str(LOGO), width=4.3 * cm, height=4.3 * cm)
    img.hAlign = "CENTER"
    story.append(img)
story += [
    Spacer(1, 0.5 * cm),
    p("Cahier de validation", "CoverTitle"),
    p("Calculs du Dashboard Minoterie", "CoverSub"),
    p("Juillet 2026 - Minoterie Abidi (M) et Groupe (G)", "Centerx"),
    Spacer(1, 0.7 * cm),
    callout("Objectif", "Présenter à l'équipe toutes les règles métier, conversions, formules, contrôles, totaux de référence et décisions utilisées dans la première version du dashboard. Les éléments marqués 'A confirmer' ne sont pas des règles définitives.", GOLD),
    Spacer(1, 1.0 * cm),
    data_table([
        ["Fichier analysé", "01-COMMERCIAL JUILLET 2026.xlsx"],
        ["Période", "01/07/2026 au 30/07/2026"],
        ["Version", "0.1 - document de travail"],
        ["Réunion", "________________________________"],
        ["Responsable", "________________________________"],
    ], [5 * cm, 10.4 * cm], header=False),
    PageBreak(),
]

story += [
    h1("1. Périmètre et sources"),
    p("Le dashboard utilise les feuilles opérationnelles du classeur de juillet. Les totaux principaux sont recalculés depuis les lignes détaillées afin d'éviter les formules mensuelles incomplètes."),
    data_table([
        ["Feuille", "Utilisation"],
        ["JOURNEE COMMERCIAL", "Ventes, prix, montants, clients, bons et recouvrements."],
        ["LIVRAISON", "Quantités livrées, unité G/M et SUIVI BLE TENDRE."],
        ["PRODUCTION", "Production par produit, Minoterie et équipe; sacs et qtx."],
        ["CLASSEUR", "Espèces, chèques et contrôle transport journalier."],
        ["CAISSE", "Recettes, dépenses, observations et solde."],
        ["PROD", "Synthèse de contrôle; certaines formules omettent la fin du mois."],
        ["TRANSPORT", "Distribution, transport blé et véhicules administratifs."],
        ["STOCKS", "Ancien modèle avril 2024; non utilisé comme stock juillet."],
    ], [4.1 * cm, 12.1 * cm]),
    Spacer(1, 0.25 * cm),
    callout("Point de contrôle", "Les valeurs du dashboard viennent du détail. Un total Excel dont la plage s'arrête avant les dernières lignes est rejeté.", GOLD),

    h1("2. Règles métier confirmées"),
    bullet("Deux Minoteries : Minoterie Abidi (M) et Groupe (G)."),
    bullet("Trois équipes normales : 16H-00H, 00H-08H et 08H-16H."),
    bullet("Les colonnes VEND sont rattachées au créneau horaire équivalent."),
    bullet("DONNE USINE désigne les produits donnés aux travailleurs."),
    bullet("DONNE USINE est suivi en quantité uniquement et exclu du CA client."),
    bullet("Les quantités peuvent être en sacs ou en qtx selon la feuille."),
    bullet("La caisse de juillet est rapprochée du total recouvrement commercial."),
    callout("A confirmer", "Chaque écriture financière devra porter G, M ou COMMUN pour permettre une comparaison financière exacte entre les deux Minoteries.", ALERT),

    h1("3. Unités et conversions"),
    formula("1 qtx = 100 kg", "Q_qtx = N_sacs x (Poids_du_sac_kg / 100)"),
    data_table([
        ["Sac", "Facteur", "Exemple"],
        ["50 kg", "0,50 qtx/sac", "20 sacs = 10 qtx"],
        ["25 kg", "0,25 qtx/sac", "20 sacs = 5 qtx"],
        ["10 kg", "0,10 qtx/sac", "20 sacs = 2 qtx"],
        ["5 kg", "0,05 qtx/sac", "20 sacs = 1 qtx"],
    ], [4 * cm, 5 * cm, 7.2 * cm]),
    p("Règle technique utilisée pour chaque ligne de production :"),
    formula("k_ligne = Q_qtx_total / N_sacs_total", "Q_qtx_shift = N_sacs_shift x k_ligne"),
    Spacer(1, 0.25 * cm),
]

story += [
    h1("4. Calculs du blé"),
    h2("Blé suivi"),
    formula("B_jour = B_G,jour + B_M,jour", "B_mois = somme(B_jour)"),
    data_table([
        ["Indicateur", "Valeur juillet"],
        ["Blé suivi G + M", "22 000,0 qtx"],
        ["Blé affecté G - SUIVI BLE TENDRE", "12 062,8 qtx"],
        ["Blé affecté M - SUIVI BLE TENDRE", "9 937,2 qtx"],
    ], [10.5 * cm, 5.7 * cm]),
    h2("Consommation réelle"),
    formula("Blé_consommé = Stock_initial + Entrées + Transferts_reçus - Transferts_envoyés - Stock_final"),
    callout("A confirmer", "Le stock initial/final de blé brut n'est pas disponible. Le dashboard ne doit donc pas présenter B_suivi comme une consommation réelle confirmée. L'hypothèse Blé_consommé environ égal à Blé_suivi reste désactivée.", ALERT),
    h2("Ajustements G/M"),
    bullet("Groupe -90 qtx et Minoterie +90 qtx."),
    bullet("Groupe -100,8 qtx et Minoterie +100,8 qtx."),
    formula("Ajustement_total = Ajustement_G + Ajustement_M = 0"),
    callout("A confirmer", "L'équipe doit préciser s'il s'agit d'une correction comptable, d'une réaffectation ou d'une autre opération. Ces lignes sont conservées et signalées.", ALERT),

    h1("5. Calculs de production"),
    formula("P_j,u,s,p = N_sacs_j,u,s,p x k_ligne", "P_j,u = somme_s somme_p(P_j,u,s,p)", "P_mois = P_mois,G + P_mois,M"),
    data_table([
        ["Indicateur", "Valeur recalculée"],
        ["Production détaillée G", "9 690,25 qtx"],
        ["Production détaillée M", "9 757,70 qtx"],
        ["Production détaillée G + M", "19 447,95 qtx"],
    ], [10.5 * cm, 5.7 * cm]),
    h2("Comparaison des équipes"),
    data_table([
        ["Équipe", "Production G + M"],
        ["16H-00H", "6 741,00 qtx"],
        ["00H-08H", "5 594,75 qtx"],
        ["08H-16H", "7 112,20 qtx"],
    ], [8 * cm, 8.2 * cm]),
    formula("Part_shift = Production_shift / Production_totale x 100", "Moyenne_shift = Production_shift / Nombre_de_jours_actifs"),
    h2("Ratio matière indicatif"),
    formula("Ratio_indicatif = Production / Blé_suivi x 100", "= 19 447,95 / 22 000 x 100 = 88,4 %"),
    callout("Limite", "Ce ratio n'est pas un rendement industriel définitif. Le rendement officiel devra utiliser le blé réellement consommé.", ALERT),
    Spacer(1, 0.25 * cm),
]

story += [
    h1("6. Ventes et chiffre d'affaires"),
    formula("CA_ligne = Quantité_qtx x Prix_unitaire_plus_transport", "CA_jour = somme(CA_ligne)", "CA_mois = somme(CA_jour)"),
    formula("CA_client = somme(CA_ligne) uniquement si Client différent de DONNE USINE"),
    data_table([
        ["Indicateur", "Valeur juillet"],
        ["Volume commercial enregistré", "19 541,55 qtx"],
        ["Chiffre d'affaires calculé", "39 076 861 DA"],
        ["Quantité DONNE USINE", "1,85 qtx"],
    ], [10.5 * cm, 5.7 * cm]),
    callout("Décision", "DONNE USINE est affiché à part en quantité. Aucune valorisation financière n'est appliquée dans la version actuelle.", GREEN),

    h1("7. Recouvrement, chèques et caisse"),
    h2("Recouvrement commercial"),
    formula("Recouvrement_commercial = Espèces_commerciales + Chèques"),
    p("Exemple du 01/07/2026 : 287 210 DA = 287 210 DA + 0 DA. Le total JOURNEE COMMERCIAL, le CLASSEUR et la CAISSE concordent."),
    data_table([
        ["Indicateur", "Valeur juillet"],
        ["Recouvrement commercial", "60 314 683 DA"],
        ["Espèces commerciales CLASSEUR", "45 869 038 DA"],
        ["Chèques CLASSEUR", "14 445 670 DA"],
        ["Écart commercial / CLASSEUR", "-25 DA"],
    ], [10.5 * cm, 5.7 * cm]),
    h2("Recettes de caisse"),
    formula("Recettes_caisse = Espèces_commerciales + Autres_recettes"),
    bullet("16/07 : remboursement 30 100 DA."),
    bullet("18/07 : remboursement 14 800 DA."),
    bullet("19/07 : remboursement environ 27 100 DA."),
    callout("A confirmer", "Les remboursements sont provisoirement classés en Autres recettes et ne doivent pas améliorer le taux de recouvrement client.", ALERT),
    h2("Dépenses et flux net"),
    formula("Dépenses_totales = Autres_dépenses + Dépenses_Minoterie", "Flux_net = Recettes_caisse - Dépenses_totales", "Solde_fin = Solde_début + Flux_net"),
    data_table([
        ["Indicateur", "Valeur juillet"],
        ["Recettes caisse", "45 941 040 DA"],
        ["Autres dépenses", "684 741,67 DA"],
        ["Dépenses Minoterie", "47 471 144,30 DA"],
        ["Dépenses totales", "48 155 885,97 DA"],
        ["Flux net", "-2 214 845,97 DA"],
        ["Solde initial", "6 632 569,01 DA"],
        ["Solde final", "4 417 723,04 DA"],
    ], [10.5 * cm, 5.7 * cm]),
    h2("Rapprochement journalier"),
    formula("Espèces_attendues_j = Recouvrement_commercial_j - Chèques_j", "Écart_caisse_j = Recettes_caisse_j - Espèces_attendues_j", "OK si |Écart| <= 50 DA; A vérifier sinon"),
    Spacer(1, 0.25 * cm),
]

story += [
    h1("8. Transport"),
    formula("Coût_distribution = 50 x Q_Guelma + 100 x Q_Skikda + 120 x Q_Sétif + 80 x Q_Constantine"),
    data_table([
        ["Composante", "Montant juillet"],
        ["Distribution commerciale", "523 000 DA"],
        ["Transport blé", "310 000 DA"],
        ["Véhicules administratifs", "66 666,64 DA"],
        ["Transport total", "899 666,64 DA"],
    ], [10.5 * cm, 5.7 * cm]),
    callout("A confirmer", "Le CLASSEUR donne 510 500 DA contre 523 000 DA dans TRANSPORT. L'écart de 12 500 DA doit être expliqué avant validation.", ALERT),

    h1("9. Contrôles automatiques"),
    data_table([
        ["Contrôle", "Règle", "Action"],
        ["Blé négatif", "B_G,j < 0 ou B_M,j < 0", "Conserver et alerter"],
        ["Écart caisse", "|Écart| > 50 DA", "Vérifier la saisie"],
        ["Remboursement", "Observation contient REMBOURSEMENT", "Autre recette"],
        ["DONNE USINE", "Client = DONNE USINE", "Quantité interne, CA exclu"],
        ["Total incomplet", "Plage Excel omet la fin du mois", "Recalculer le détail"],
        ["Unité absente", "Pas de G/M/COMMUN", "Ne pas forcer"],
        ["Libellé variable", "ZWAL/ZWEL, DECHI/DECHET", "Normaliser"],
    ], [4 * cm, 6.3 * cm, 5.9 * cm]),
    h2("Anomalies observées"),
    bullet("14/07 : BOUCHMAL WALID, écart de 43 DA entre commercial et classeur."),
    bullet("19/07 : ATIA FARID, écart de 18 DA entre commercial et classeur."),
    bullet("N°BL 2497 apparaît deux fois."),
    bullet("Le total Sétif du transport omet 250 qtx du 30/07."),
    bullet("La feuille STOCKS contient avril 2024 et non juillet 2026."),

    h1("10. Décisions de présentation"),
    bullet("Page d'accueil : Dashboard Magasin ou Dashboard Minoterie."),
    bullet("Sidebar ouvrable et refermable."),
    bullet("Pages : Vue manager, Blé et production, Équipes, Ventes, Caisse, Anomalies."),
    bullet("Filtres : Mois, Date, Minoterie G/M."),
    bullet("Graphiques de production normalisés en qtx; sacs conservés dans le détail."),
    bullet("Recouvrement espèces, chèques, autres recettes et caisse séparés."),
    bullet("Avertissement lorsque le filtre G/M ne peut pas séparer la finance."),
    bullet("Import des prochains fichiers mensuels de même structure."),
    Spacer(1, 0.25 * cm),
]

story += [
    h1("11. Calculs non activés"),
    bullet("Rendement industriel exact sans consommation réelle du blé."),
    bullet("Marge produit sans coûts blé, emballage, énergie, main-d'oeuvre et maintenance."),
    bullet("Résultat financier G/M sans dimension financière sur chaque écriture."),
    bullet("Prévision fiable du mois suivant avec un seul mois d'historique."),
    bullet("Valorisation monétaire de DONNE USINE sans règle de coût validée."),

    PageBreak(),
    h1("12. Checklist de validation"),
    data_table([
        ["N°", "Point à valider", "Oui", "Non"],
        ["1", "JOURNEE COMMERCIAL et LIVRAISON sont bien en qtx.", "[ ]", "[ ]"],
        ["2", "Les facteurs 50/25/10/5 kg sont corrects.", "[ ]", "[ ]"],
        ["3", "Les colonnes VEND sont regroupées avec le même créneau.", "[ ]", "[ ]"],
        ["4", "SUIVI BLE TENDRE est du blé suivi, pas une consommation confirmée.", "[ ]", "[ ]"],
        ["5", "Les ajustements -90/+90 et -100,8/+100,8 sont expliqués.", "[ ]", "[ ]"],
        ["6", "DONNE USINE est exclu du CA et suivi en quantité.", "[ ]", "[ ]"],
        ["7", "Les remboursements sont classés Autres recettes.", "[ ]", "[ ]"],
        ["8", "Le seuil d'alerte caisse de 50 DA est accepté.", "[ ]", "[ ]"],
        ["9", "La source officielle du transport est choisie.", "[ ]", "[ ]"],
        ["10", "G/M/COMMUN sera ajouté aux écritures financières.", "[ ]", "[ ]"],
        ["11", "Le stock initial/final de blé brut sera fourni.", "[ ]", "[ ]"],
        ["12", "Les futurs fichiers garderont la même structure.", "[ ]", "[ ]"],
    ], [0.8 * cm, 11.4 * cm, 2 * cm, 2 * cm]),
    Spacer(1, 0.7 * cm),
    data_table([
        ["Responsable Minoterie G", "Responsable Minoterie M"],
        ["\n\nNom, date, signature: __________________", "\n\nNom, date, signature: __________________"],
        ["Responsable commercial / caisse", "Direction"],
        ["\n\nNom, date, signature: __________________", "\n\nNom, date, signature: __________________"],
    ], [8.1 * cm, 8.1 * cm], header=False),
    Spacer(1, 0.5 * cm),
    callout("Après validation", "Chaque décision doit être mise à jour dans le code, le dictionnaire de données et ce document avant utilisation officielle du dashboard.", GOLD),
]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
doc = ReportDoc(str(OUTPUT), pagesize=A4, leftMargin=2 * cm, rightMargin=2 * cm, topMargin=1.75 * cm, bottomMargin=1.65 * cm, title="Validation des calculs - Dashboard Minoterie", author="Groupe ABIDI")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates([PageTemplate(id="all", frames=frame, onPage=header_footer)])
doc.build(story)
print(OUTPUT)
