export interface County {
  name: string;
  towns: string[];
}

// Kenya's 47 counties with their principal town(s).
export const KENYA_COUNTIES: County[] = [
  { name: 'Mombasa', towns: ['Mombasa'] },
  { name: 'Kwale', towns: ['Kwale', 'Ukunda', 'Diani'] },
  { name: 'Kilifi', towns: ['Kilifi', 'Malindi', 'Watamu'] },
  { name: 'Tana River', towns: ['Hola'] },
  { name: 'Lamu', towns: ['Lamu'] },
  { name: 'Taita-Taveta', towns: ['Voi', 'Taveta', 'Wundanyi'] },
  { name: 'Garissa', towns: ['Garissa'] },
  { name: 'Wajir', towns: ['Wajir'] },
  { name: 'Mandera', towns: ['Mandera'] },
  { name: 'Marsabit', towns: ['Marsabit', 'Moyale'] },
  { name: 'Isiolo', towns: ['Isiolo'] },
  { name: 'Meru', towns: ['Meru'] },
  { name: 'Tharaka-Nithi', towns: ['Chuka', 'Kathwana'] },
  { name: 'Embu', towns: ['Embu'] },
  { name: 'Kitui', towns: ['Kitui'] },
  { name: 'Machakos', towns: ['Machakos', 'Athi River', 'Kangundo'] },
  { name: 'Makueni', towns: ['Wote'] },
  { name: 'Nyandarua', towns: ['Ol Kalou', 'Nyahururu'] },
  { name: 'Nyeri', towns: ['Nyeri', 'Karatina'] },
  { name: 'Kirinyaga', towns: ['Kerugoya', 'Kagio'] },
  { name: "Murang'a", towns: ["Murang'a", 'Kangema'] },
  { name: 'Kiambu', towns: ['Kiambu', 'Thika', 'Ruiru', 'Limuru'] },
  { name: 'Turkana', towns: ['Lodwar'] },
  { name: 'West Pokot', towns: ['Kapenguria'] },
  { name: 'Samburu', towns: ['Maralal'] },
  { name: 'Trans Nzoia', towns: ['Kitale'] },
  { name: 'Uasin Gishu', towns: ['Eldoret'] },
  { name: 'Elgeyo-Marakwet', towns: ['Iten', 'Kapsowar'] },
  { name: 'Nandi', towns: ['Kapsabet', 'Nandi Hills'] },
  { name: 'Baringo', towns: ['Kabarnet'] },
  { name: 'Laikipia', towns: ['Nanyuki', 'Rumuruti'] },
  { name: 'Nakuru', towns: ['Nakuru', 'Naivasha', 'Gilgil'] },
  { name: 'Narok', towns: ['Narok'] },
  { name: 'Kajiado', towns: ['Kajiado', 'Ngong', 'Kitengela'] },
  { name: 'Kericho', towns: ['Kericho'] },
  { name: 'Bomet', towns: ['Bomet'] },
  { name: 'Kakamega', towns: ['Kakamega', 'Mumias'] },
  { name: 'Vihiga', towns: ['Vihiga', 'Mbale'] },
  { name: 'Bungoma', towns: ['Bungoma', 'Webuye'] },
  { name: 'Busia', towns: ['Busia', 'Malaba'] },
  { name: 'Siaya', towns: ['Siaya', 'Bondo'] },
  { name: 'Kisumu', towns: ['Kisumu'] },
  { name: 'Homa Bay', towns: ['Homa Bay'] },
  { name: 'Migori', towns: ['Migori', 'Kehancha'] },
  { name: 'Kisii', towns: ['Kisii'] },
  { name: 'Nyamira', towns: ['Nyamira'] },
  { name: 'Nairobi', towns: ['Nairobi'] },
];

export const COUNTY_NAMES = KENYA_COUNTIES.map((county) => county.name);

export function getTownsForCounty(county: string | undefined): string[] {
  if (!county) return [];
  return KENYA_COUNTIES.find((c) => c.name === county)?.towns ?? [];
}
