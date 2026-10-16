// normalize() de ../evaluacion-a2/lib/exam.js, portado tal cual (mismo orden de
// pasos). Dos respuestas son iguales si normalizan igual:
//  - mayúsculas, espacios de sobra y puntuación (. , ; : ! ? ¿ ¡ " ( )) no importan
//  - tildes: Sofía = Sofia
//  - la variante del apóstrofe: ' ‘ ’ ʼ ´ ` se tratan todas igual
//  - contracciones negativas: doesn't = does not, can't = cannot = can not,
//    won't = will not (también escritas sin apóstrofe: dont, isnt, cant…)
//  - sinónimos aceptados: cellphone / cell phone = phone, clean up = clean,
//    dad / daddy = father, mom / mommy / mum / mummy = mother
// Las contracciones positivas ('s, 're, 'll) NO se expanden: se aceptan
// agregando la variante en respuestas_aceptadas.
export function normalize(s: unknown): string {
  return String(s ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // ignora acentos: Sofía = Sofia, María = Maria
    .replace(/[‘’ʼ´`']/g, "'") // unifica apóstrofes a '
    .replace(/\bcan't\b/g, "can not")
    .replace(/\bcannot\b/g, "can not")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\bshan't\b/g, "shall not")
    .replace(/n't\b/g, " not") // doesn't→does not, isn't→is not, aren't→are not…
    // contracciones escritas SIN apóstrofe (quien no sabe ponerlo): dont, isnt…
    .replace(/\bcant\b/g, "can not")
    .replace(/\bwont\b/g, "will not")
    .replace(/\b(do|does|did|is|are|was|were|has|have|had|could|would|should|must|need)nt\b/g, "$1 not")
    // Sinónimos aceptados (ambas formas valen como correctas):
    .replace(/\bcell ?phone\b/g, "phone") // cellphone / cell phone = phone
    .replace(/\bclean up\b/g, "clean") // clean up = clean
    .replace(/\b(dad|daddy)\b/g, "father") // dad/daddy = father (papá/padre)
    .replace(/\b(mom|mommy|mum|mummy)\b/g, "mother") // mom/mum = mother (mamá/madre)
    .replace(/[.,;:!?¿¡"()]/g, "") // la puntuación no importa
    .replace(/'/g, "") // apóstrofes restantes (posesivos) tampoco importan
    .replace(/\s+/g, " ")
    .trim();
}
