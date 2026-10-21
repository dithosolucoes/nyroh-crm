import { Lead } from '../types';

// Dicionário de tradução dos termos técnicos do Google Places para nomes comerciais elegantes em Português
const GOOGLE_PLACES_PRETTY_MAP: Record<string, string> = {
  // Construção, Reformas & Manutenção
  general_contractor: 'Construção & Reformas (Marido de Aluguel / Empreiteiro)',
  roofing_contractor: 'Telhados & Coberturas',
  plumber: 'Encanador & Hidráulica',
  electrician: 'Eletricista & Instalações',
  painter: 'Pintor & Acabamentos',
  carpenter: 'Marcenaria & Carpintaria',
  locksmith: 'Chaveiro',
  hvac_contractor: 'Ar-Condicionado & Climatização',
  air_conditioning_contractor: 'Ar-Condicionado & Climatização',
  air_conditioning_repair_service: 'Conserto de Ar-Condicionado',
  masonry_contractor: 'Alvenaria & Obras',
  paving_contractor: 'Pavimentação & Asfalto',
  fence_contractor: 'Cercas & Mourões',
  swimming_pool_contractor: 'Piscinas & Manutenção',
  glass_repair_service: 'Vidraçaria & Espelhos',
  glazier: 'Vidraçaria & Esquadrias',
  'glass & mirror shop': 'Vidraçaria & Espelhos',
  iron_works: 'Serralheria & Estruturas Metálicas',
  welder: 'Solda & Serralheria',
  appliance_repair_service: 'Conserto de Eletrodomésticos',
  handyman: 'Marido de Aluguel & Reparos',

  // Arquitetura, Engenharia & Design
  architect: 'Arquitetura & Projetos',
  architectural_designer: 'Arquitetura & Design',
  interior_designer: 'Design de Interiores & Decoração',
  landscape_architect: 'Paisagismo & Jardinagem',
  engineering_consultant: 'Engenharia & Projetos',

  // Móveis & Decoração
  furniture_store: 'Móveis & Decoração (Móveis Planejados)',
  home_goods_store: 'Utilidades Domésticas & Decoração',
  furniture_repair_shop: 'Reforma & Conserto de Móveis',

  // Saúde, Clínicas & Odontologia
  dentist: 'Odontologia & Dentistas',
  dental_clinic: 'Odontologia & Clínicas',
  doctor: 'Saúde & Clínicas Médicas',
  physician: 'Saúde & Clínicas Médicas',
  medical_clinic: 'Clínica Médica & Saúde',
  hospital: 'Hospital & Pronto Atendimento',
  health: 'Saúde & Clínicas',
  physiotherapist: 'Fisioterapia & Reabilitação',
  psychologist: 'Psicologia & Terapia',
  mental_health_clinic: 'Psicologia & Saúde Mental',
  pharmacy: 'Farmácia & Drogaria',
  drugstore: 'Drogaria & Farmácia',
  optician: 'Ótica & Óculos',
  optometrist: 'Ótica & Exames',

  // Jurídico, Financeiro & Consultoria
  lawyer: 'Advocacia & Jurídico',
  attorney: 'Advocacia & Jurídico',
  law_firm: 'Escritório de Advocacia',
  legal_services: 'Serviços Jurídicos',
  accounting: 'Contabilidade & Fiscal',
  accountant: 'Contabilidade & Finanças',
  bookkeeping: 'Contabilidade',
  finance: 'Finanças & Crédito',
  insurance_agency: 'Seguros & Benefícios',
  consultant: 'Consultoria Empresarial',

  // Automotivo & Transportes
  car_repair: 'Oficina Mecânica & Auto Center',
  auto_repair: 'Oficina Mecânica & Auto Center',
  auto_body_shop: 'Funilaria & Pintura',
  car_dealer: 'Concessionária & Revenda de Veículos',
  used_car_dealer: 'Revenda de Carros Usados',
  car_wash: 'Lava-Rápido & Estética Automotiva',
  auto_parts_store: 'Autopeças & Acessórios',
  tire_shop: 'Pneus & Borracharia',
  motorcycle_repair_shop: 'Oficina de Motos',
  moving_company: 'Mudanças & Fretes',
  towing_service: 'Guincho & Auto Socorro',

  // Beleza, Estética & Bem-Estar
  beauty_salon: 'Salão de Beleza & Estética',
  hair_care: 'Salão de Beleza & Cabelereiros',
  hair_salon: 'Salão de Beleza & Cabelereiros',
  barber_shop: 'Barbearia',
  spa: 'Spa & Estética',
  nail_salon: 'Manicure & Esmalteria',
  tattoo_shop: 'Tatuagem & Piercing',

  // Gastronomia, Bares & Restaurantes
  restaurant: 'Restaurante & Gastronomia',
  food: 'Alimentação & Gastronomia',
  pizza_restaurant: 'Pizzaria',
  bar: 'Bar & Chopperia',
  pub: 'Bar & Pub',
  hamburger_restaurant: 'Hamburgueria',
  fast_food_restaurant: 'Lanchonete & Fast Food',
  cafe: 'Cafeteria & Bistrô',
  coffee_shop: 'Cafeteria & Bistrô',
  bakery: 'Padaria & Confeitaria',
  ice_cream_shop: 'Sorveteria & Açaí',
  meal_delivery: 'Delivery de Comida',
  meal_takeaway: 'Comida para Viagem / Marmitaria',

  // Fitness, Esportes & Lazer
  gym: 'Academia & Fitness',
  fitness_center: 'Academia & Fitness',
  pilates_studio: 'Studio de Pilates',
  yoga_studio: 'Studio de Yoga',
  martial_arts_school: 'Artes Marciais & Lutas',

  // Pets & Veterinária
  veterinary_care: 'Clínica Veterinária',
  veterinarian: 'Clínica Veterinária',
  pet_store: 'Pet Shop & Banho e Tosa',
  pet_grooming: 'Banho e Tosa & Estética Pet',

  // Imobiliária
  real_estate_agency: 'Imobiliária & Corretores',
  real_estate_agent: 'Corretor de Imóveis',
  housing_development: 'Construtora & Incorporadora',

  // Educação & Cursos
  school: 'Escola & Educação',
  university: 'Faculdade & Universidade',
  language_school: 'Escola de Idiomas',

  // Outros
  hotel: 'Hotel & Hospedagem',
  cleaning_service: 'Limpeza & Conservação',
  pest_control_service: 'Dedetização & Pragas',
  security_system_supplier: 'Segurança Eletrônica & Alarmes',
  solar_energy_company: 'Energia Solar',
  print_shop: 'Gráfica & Comunicação Visual',
  florist: 'Floricultura & Plantas',
  clothing_store: 'Moda & Roupas',
  shoe_store: 'Calçados',
  supermarket: 'Supermercado & Mercearia',
  grocery_store: 'Mercearia & Mercado',
  hardware_store: 'Materiais de Construção & Ferramentas',
  building_materials_store: 'Materiais de Construção'
};

// Tags neutras do Google Maps que NÃO identificam uma profissão real
const GENERIC_GOOGLE_TAGS = new Set([
  'point_of_interest',
  'establishment',
  'premise',
  'subpremise',
  'geocode',
  'political',
  'route',
  'street_address',
  'neighborhood',
  'locality',
  'general',
  'outros',
  'other',
  'sem categoria no json',
  '(sem categoria no json)'
]);

/**
 * Formata qualquer palavra avulsa em título legível (ex: "metal_finishing" -> "Metal Finishing")
 */
function cleanCategoryTitle(raw: string): string {
  if (!raw) return '';
  const lower = raw.toLowerCase().trim();
  if (GOOGLE_PLACES_PRETTY_MAP[lower]) {
    return GOOGLE_PLACES_PRETTY_MAP[lower];
  }

  const cleaned = raw.replace(/[_-]+/g, ' ').trim();
  return cleaned
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/**
 * Analisa o nome da empresa e a URL quando o Google só mandou "point_of_interest" ou "establishment"
 */
function deduceNicheFromName(name: string, url: string = ''): string | null {
  const fullText = `${name} ${url}`.toLowerCase();

  // Marcenaria & Móveis
  if (/marcenar|moveis.*planejad|móveis.*planejad|montador.*moveis|montador.*móveis|marceneir/.test(fullText)) {
    return 'Marcenaria & Móveis Planejados';
  }

  // Construção, Reformas & Marido de Aluguel
  if (/marido.*aluguel|pequenos.*reparos|conserto.*gerais/.test(fullText)) {
    return 'Construção & Reformas (Marido de Aluguel)';
  }
  if (/pedreir|reform|empreiteir|alvenaria|mestre.*obras|construc|construç|empreendimento/.test(fullText)) {
    return 'Construção & Reformas';
  }

  // Vidraçaria & Esquadrias
  if (/vidra[çc]|box.*banheir|esquadri|espelho/.test(fullText)) {
    return 'Vidraçaria & Esquadrias';
  }

  // Serralheria & Estruturas
  if (/serralh|solda|grade|portao|portão/.test(fullText)) {
    return 'Serralheria & Estruturas';
  }

  // Pintura
  if (/pintur|pintor/.test(fullText)) {
    return 'Pintura & Acabamentos';
  }

  // Encanador & Hidráulica
  if (/desentup|encanad|hidraul|hidrául/.test(fullText)) {
    return 'Encanador & Desentupidora';
  }

  // Ar-Condicionado & Refrigeração
  if (/refrigera|ar.*condicionad|climatiza/.test(fullText)) {
    return 'Ar-Condicionado & Climatização';
  }

  // Chaveiro
  if (/chaveir/.test(fullText)) {
    return 'Chaveiro';
  }

  // Gesso & Drywall
  if (/gesso|drywall/.test(fullText)) {
    return 'Gesso & Drywall';
  }

  // Restaurantes, Bares, Pizzarias & Cantinas
  if (/cantina|pizz|restauran|lanch|bar\b|burger|hamburg|café|cafe|bistr|churrasc|gastronom|acai|açaí|sushi|delivery|sanduich|sanduíche|marmit/.test(fullText)) {
    return 'Restaurante & Gastronomia';
  }

  // Automotivo, Oficinas, Car Service, Garagens & Mecânicas
  if (/mecanic|mecânic|auto\b|oficina|pneu|veicul|veícul|carro|martelinho|funilaria|moto\b|car.*service|garagem|auto.*center|centro.*automotivo|troca.*oleo/.test(fullText)) {
    return 'Oficina & Automotivo';
  }

  // Academias & Fitness
  if (/academ|crossfit|fitness|treino|pilates|personal|ginastic/.test(fullText)) {
    return 'Fitness & Academia';
  }

  // Contabilidade
  if (/contab|fiscal|tribut|pericia.*contabil|auditor/.test(fullText)) {
    return 'Contabilidade & Finanças';
  }

  // Advocacia
  if (/advog|jurid|advocac|direito|oab/.test(fullText)) {
    return 'Advocacia & Jurídico';
  }

  // Odontologia
  if (/odont|dentis|implante|ortodon|sorriso|dental/.test(fullText)) {
    return 'Odontologia & Dentistas';
  }

  // Arquitetura & Design
  if (/arquit|design.*interior|decor|urbanis/.test(fullText)) {
    return 'Arquitetura & Design';
  }

  // Salão, Estética, Cabelereiro & Barbearia
  if (/estet|estét|beleza|salao|salão|cabel|barber|barbearia|sobrancelh|manicur|unha|spa|massag/.test(fullText)) {
    return 'Estética & Beleza';
  }

  // Pet Shop & Veterinária
  if (/veterin|pet\b|petshop|banho.*tosa|animal|cao\b|cachorro/.test(fullText)) {
    return 'Pet & Veterinária';
  }

  // Imobiliária
  if (/imobili|imove|imóve|corretor.*imove|construt|locac.*imove/.test(fullText)) {
    return 'Imobiliária & Construção';
  }

  // Saúde, Clínicas & Médicos
  if (/medic|clinic|clínic|saude|saúde|psicol|fisioter|oftalmo|laborat|pediatr|dermatol|nutri/.test(fullText)) {
    return 'Saúde & Clínicas';
  }

  // Depósito de Materiais ou Bebidas
  if (/deposito|depósito/.test(fullText)) {
    return 'Depósito & Comércio';
  }

  // Gráfica & Comunicação Visual
  if (/grafic|gráfic|impress|comunic.*visual|brinde/.test(fullText)) {
    return 'Gráfica & Comunicação Visual';
  }

  // Floricultura
  if (/floric|flores|flor\b/.test(fullText)) {
    return 'Floricultura & Plantas';
  }

  // Educação & Cursos
  if (/escol|colegio|colégio|curso|faculd|idioma|educac|bercar/.test(fullText)) {
    return 'Educação & Cursos';
  }

  // Energia Solar
  if (/energi.*solar|fotovolt|placa.*solar/.test(fullText)) {
    return 'Energia Solar';
  }

  // Hotel & Pousada
  if (/hotel|pousada|resort|hostel|turism/.test(fullText)) {
    return 'Hotel & Pousada';
  }

  // Segurança Eletrônica
  if (/seguran.*eletron|alarme|cftv|portaria/.test(fullText)) {
    return 'Segurança Eletrônica';
  }

  // Doceria & Padaria
  if (/sorvet|doceri|confeit|bolo|padar/.test(fullText)) {
    return 'Confeitaria & Padaria';
  }

  // Moda & Roupas
  if (/moda|roupa|calcado|calçado|vestu|boutique|loja/.test(fullText)) {
    return 'Moda & Varejo';
  }

  // Seguros
  if (/seguro|corretor.*seguro|previdenc/.test(fullText)) {
    return 'Seguros & Benefícios';
  }

  // Eventos & Festas
  if (/festas|eventos|buffet|casamento|decorac.*festa/.test(fullText)) {
    return 'Eventos & Festas';
  }

  return null;
}

/**
 * Função MESTRA para identificar o nicho do Lead proporcionando a MELHOR EXPERIÊNCIA:
 * 1. Pega a categoria do JSON do cliente.
 * 2. Se for uma categoria real do Google (ex: "furniture_store", "general_contractor", "lawyer"), traduz para o Português profissional que todo vendedor entende de cara!
 * 3. Se for apenas "point_of_interest" ou "establishment" (tags genéricas do Google), analisa o nome da empresa e URL para não deixar o lead sem categoria!
 * 4. NENHUM lead fica como "point_of_interest" ou jogado no lixo!
 */
export function getLeadNiche(
  lead: Lead | { name?: string; categories?: any; publicUrl?: string; niche?: string; types?: any; category?: any; primaryType?: any }
): string {
  if (!lead) return 'Comércio & Serviços Gerais';

  const anyLead = lead as any;
  const name = (anyLead.name || '').trim();
  const publicUrl = (anyLead.publicUrl || '').trim();

  // 1. Extração dos campos brutos de categoria do JSON
  const rawList: string[] = [];
  const candidateSources = [
    anyLead.categories,
    anyLead.category,
    anyLead.types,
    anyLead.type,
    anyLead.primaryType,
    anyLead.segmento,
    anyLead.ramo,
    anyLead.niche
  ];

  for (const item of candidateSources) {
    if (item === undefined || item === null) continue;

    if (Array.isArray(item)) {
      item.forEach((sub) => {
        if (typeof sub === 'string' && sub.trim()) rawList.push(sub.trim());
      });
    } else if (typeof item === 'string' && item.trim()) {
      const trimmed = item.trim();
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) {
            parsed.forEach((p) => {
              if (typeof p === 'string' && p.trim()) rawList.push(p.trim());
            });
            continue;
          }
        } catch {
          // ignore
        }
      }

      if (trimmed.includes(',')) {
        trimmed.split(',').forEach((p) => {
          if (p.trim()) rawList.push(p.trim());
        });
      } else {
        rawList.push(trimmed);
      }
    }
  }

  // 2. Filtra tags genéricas do Google Maps (point_of_interest, establishment, etc)
  const specificCategories = rawList.filter((cat) => {
    const lower = cat.toLowerCase().trim();
    return !GENERIC_GOOGLE_TAGS.has(lower);
  });

  // 3. Se temos categorias específicas do JSON, traduz para o Português profissional!
  if (specificCategories.length > 0) {
    const translated = specificCategories.map((c) => cleanCategoryTitle(c));
    // Retorna único ou combinado
    const unique = Array.from(new Set(translated));
    return unique[0]; // Retorna a categoria principal traduzida de forma limpa
  }

  // 4. Se o Google só mandou "point_of_interest" ou "establishment", deduz pelo nome do estabelecimento!
  const deduced = deduceNicheFromName(name, publicUrl);
  if (deduced) {
    return deduced;
  }

  // 5. Fallback final elegante caso realmente não haja nenhuma menção
  return 'Comércio & Serviços Gerais';
}
