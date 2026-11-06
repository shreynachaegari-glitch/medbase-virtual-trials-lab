/**
 * The MedBase knowledge base: the learning-facing record for a condition.
 *
 * This is the layer students read and the layer the Lab draws from. A condition is simulable
 * only when it carries a `labModel` binding, and the Lab builds its condition list from those
 * bindings — so a record without one cannot quietly be "modelled anyway".
 */
export interface Disease {
    id: string;
    name: string;
    category: string;
    description: string;
    causes: string[];
    riskFactors: string[];
    prevention: string[];
    treatment: string[];
    sources: {
        name: string;
        url: string;
    }[];
    keywords: string[];
    /**
     * Starting points for the Lab's live database panels. These are lookups to run, not
     * claims: a gene listed here is one worth looking up for the condition (a replicated
     * locus, a pathway member or a drug target), never an assertion that it causes it.
     */
    research: {
        /** The term literature and trial searches start from. */
        term: string;
        drugs: string[];
        genes: string[];
    };
    /**
     * Environmental context: where and under what conditions the condition occurs. Qualitative
     * and drawn from the cited sources - not a risk score and not an input to any model.
     */
    environment?: {
        regions: string[];
        temperature: string[];
        soil: string[];
        food: string[];
    };
    labModel?: {
        /** The only implemented model today; lives in src/sim. */
        id: "t2d-progression";
        label: string;
        /** What the model covers out of everything this record describes. */
        scope: string;
    };
}

export const diseases: Disease[] = [
    {
        id: "diabetes",
        name: "Diabetes Mellitus",
        category: "Metabolic",
        description: "A chronic condition where the body cannot properly process blood glucose (sugar). There are two main types: Type 1 (body doesn't produce insulin) and Type 2 (body doesn't use insulin properly).",
        causes: [
            "Type 1: Autoimmune destruction of insulin-producing cells",
            "Type 2: Insulin resistance combined with inadequate insulin production",
            "Genetic factors",
            "Environmental triggers"
        ],
        riskFactors: [
            "Family history of diabetes",
            "Obesity or overweight",
            "Physical inactivity",
            "Age over 45 years",
            "High blood pressure",
            "Unhealthy diet"
        ],
        prevention: [
            "Maintain a healthy weight",
            "Exercise regularly (at least 30 minutes daily)",
            "Eat a balanced diet rich in fiber",
            "Limit sugar and refined carbohydrates",
            "Regular health check-ups",
            "Avoid smoking and excessive alcohol"
        ],
        treatment: [
            "Lifestyle modifications (diet and exercise)",
            "Blood glucose monitoring",
            "Oral medications (for Type 2)",
            "Insulin therapy (for Type 1 and some Type 2)",
            "Regular medical supervision"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/diabetes" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/diabetes.html" },
            { name: "ICMR", url: "https://icmr.gov.in" },
            { name: "Gov UK", url: "https://www.gov.uk/health-and-social-care" },
            { name: "TGA", url: "https://www.tga.gov.au" }
        ],
        keywords: ["diabetes", "blood sugar", "insulin", "type 1", "type 2", "glucose"],
        research: { term: "type 2 diabetes", drugs: ["metformin", "empagliflozin", "semaglutide", "glipizide", "pioglitazone"], genes: ["TCF7L2", "KCNJ11", "PPARG", "SLC30A8"] },
        labModel: {
            id: "t2d-progression",
            label: "Type 2 diabetes progression",
            scope: "Type 2 only, and only the glycaemic pathway: HbA1c drift over time and the microvascular and myocardial infarction hazard that follows from it. Type 1, acute complications, and everything else on this page are outside the model."
        }
    },
    {
        id: "hypertension",
        name: "Hypertension (High Blood Pressure)",
        category: "Cardiovascular",
        description: "A condition where blood pressure in the arteries is persistently elevated. Often called the 'silent killer' because it usually has no symptoms but can lead to serious complications.",
        causes: [
            "Primary hypertension: No identifiable cause, develops gradually",
            "Secondary hypertension: Caused by underlying conditions",
            "Kidney disease",
            "Hormonal disorders",
            "Certain medications"
        ],
        riskFactors: [
            "Age (risk increases with age)",
            "Family history",
            "Being overweight or obese",
            "Lack of physical activity",
            "High salt diet",
            "Excessive alcohol consumption",
            "Stress"
        ],
        prevention: [
            "Reduce salt intake (less than 5g/day)",
            "Eat more fruits and vegetables",
            "Exercise regularly",
            "Maintain healthy weight",
            "Limit alcohol consumption",
            "Manage stress",
            "Avoid tobacco use"
        ],
        treatment: [
            "Lifestyle modifications",
            "Antihypertensive medications",
            "Regular blood pressure monitoring",
            "Treatment of underlying conditions",
            "Dietary changes (DASH diet)"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/hypertension" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/highbloodpressure.html" }
        ],
        keywords: ["hypertension", "high blood pressure", "bp", "cardiovascular"],
        research: { term: "hypertension", drugs: ["amlodipine", "lisinopril", "losartan", "hydrochlorothiazide"], genes: ["AGT", "ACE", "AGTR1"] }
    },
    {
        id: "dengue",
        name: "Dengue Fever",
        category: "Infectious",
        description: "A mosquito-borne viral infection causing flu-like illness. In severe cases, it can develop into dengue hemorrhagic fever, which can be life-threatening.",
        causes: [
            "Dengue virus (DENV) - four serotypes",
            "Transmitted by Aedes mosquitoes (mainly Aedes aegypti)",
            "Mosquito bites during daytime",
            "Urban and semi-urban areas"
        ],
        riskFactors: [
            "Living in tropical/subtropical regions",
            "Previous dengue infection",
            "Rainy season",
            "Stagnant water near living areas",
            "Lack of mosquito control measures"
        ],
        prevention: [
            "Eliminate mosquito breeding sites",
            "Use mosquito repellents",
            "Wear long-sleeved clothing",
            "Use mosquito nets and screens",
            "Keep water containers covered",
            "Community mosquito control programs"
        ],
        treatment: [
            "No specific antiviral treatment",
            "Rest and hydration",
            "Paracetamol for fever and pain",
            "Avoid aspirin and NSAIDs",
            "Monitor for warning signs",
            "Hospital care for severe cases"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/dengue-and-severe-dengue" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/dengue.html" },
            { name: "ICMR", url: "https://icmr.gov.in" }
        ],
        keywords: ["dengue", "mosquito", "fever", "aedes", "viral"],
        research: { term: "dengue", drugs: ["acetaminophen"], genes: [] },
        environment: { regions: ["Tropical and subtropical regions, including South and Southeast Asia, the Americas and the Western Pacific", "Urban and semi-urban areas where Aedes mosquitoes breed in stored water"], temperature: ["Transmission rises in warm, humid conditions; mosquito development speeds up with warmth", "Outbreaks often follow the rainy season"], soil: ["Not soil-borne; breeding sites are standing water in containers, tyres and coolers"], food: ["Not food-borne", "Maintain hydration and nutrition during illness"] }
    },
    {
        id: "malaria",
        name: "Malaria",
        category: "Infectious",
        description: "A life-threatening disease caused by parasites transmitted through infected female Anopheles mosquito bites. It is preventable and curable with early treatment.",
        causes: [
            "Plasmodium parasites (P. falciparum most dangerous)",
            "Female Anopheles mosquito bites",
            "Blood transfusion (rare)",
            "Mother to child during pregnancy"
        ],
        riskFactors: [
            "Living in or traveling to endemic areas",
            "Lack of preventive measures",
            "Young children and pregnant women",
            "Poor access to healthcare",
            "Drug-resistant malaria regions"
        ],
        prevention: [
            "Sleep under insecticide-treated nets",
            "Use mosquito repellents",
            "Indoor residual spraying",
            "Antimalarial medications for travelers",
            "Eliminate mosquito breeding sites",
            "Early diagnosis and treatment"
        ],
        treatment: [
            "Artemisinin-based combination therapies (ACTs)",
            "Early diagnosis essential",
            "Complete the full course of treatment",
            "Supportive care for severe cases",
            "Hospital admission for complicated malaria"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/malaria" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/malaria.html" },
            { name: "NVBDCP", url: "https://nvbdcp.gov.in" }
        ],
        keywords: ["malaria", "mosquito", "plasmodium", "fever", "anopheles"],
        research: { term: "malaria", drugs: ["artemether", "atovaquone", "chloroquine", "primaquine"], genes: ["HBB", "G6PD", "ACKR1"] },
        environment: { regions: ["Sub-Saharan Africa carries most cases; also South and Southeast Asia, the Eastern Mediterranean and the Americas"], temperature: ["Parasite development in the Anopheles mosquito depends on warmth; transmission is seasonal where temperature or rainfall varies"], soil: ["Not soil-borne; mosquitoes breed in pools, irrigated fields and slow water"], food: ["Not food-borne", "Malnutrition raises the risk of severe disease in children"] }
    },
    {
        id: "covid-19",
        name: "COVID-19",
        category: "Infectious",
        description: "An infectious disease caused by the SARS-CoV-2 virus. Most people experience mild to moderate respiratory illness and recover without special treatment.",
        causes: [
            "SARS-CoV-2 virus",
            "Spread through respiratory droplets",
            "Close contact with infected persons",
            "Airborne transmission in enclosed spaces"
        ],
        riskFactors: [
            "Close contact with infected persons",
            "Older age",
            "Underlying health conditions",
            "Weakened immune system",
            "Unvaccinated status"
        ],
        prevention: [
            "Get vaccinated",
            "Wear masks in crowded spaces",
            "Maintain physical distancing",
            "Practice hand hygiene",
            "Ensure good ventilation",
            "Stay home when sick"
        ],
        treatment: [
            "Rest and hydration for mild cases",
            "Symptomatic treatment",
            "Antiviral medications for high-risk patients",
            "Oxygen therapy for severe cases",
            "Hospital care for critical cases"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/health-topics/coronavirus" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/covid19coronavirusdisease2019.html" },
            { name: "MoHFW India", url: "https://www.mohfw.gov.in" },
            { name: "Gov UK - COVID-19", url: "https://www.gov.uk/coronavirus" },
            { name: "TGA - COVID-19", url: "https://www.tga.gov.au/products/covid-19" }
        ],
        keywords: ["covid", "coronavirus", "sars-cov-2", "pandemic", "respiratory"],
        research: { term: "COVID-19", drugs: ["nirmatrelvir", "remdesivir", "dexamethasone", "baricitinib"], genes: ["ACE2", "TMPRSS2"] }
    },
    {
        id: "tuberculosis",
        name: "Tuberculosis (TB)",
        category: "Infectious",
        description: "A bacterial infection that mainly affects the lungs. TB spreads through the air when infected people cough, sneeze, or spit. It is curable and preventable.",
        causes: [
            "Mycobacterium tuberculosis bacteria",
            "Airborne transmission",
            "Prolonged close contact with infected person",
            "Latent TB can become active"
        ],
        riskFactors: [
            "HIV/AIDS",
            "Weakened immune system",
            "Close contact with TB patients",
            "Malnutrition",
            "Diabetes",
            "Living in crowded conditions"
        ],
        prevention: [
            "BCG vaccination for children",
            "Good ventilation in living spaces",
            "Early detection and treatment",
            "Complete the full treatment course",
            "Infection control in healthcare settings"
        ],
        treatment: [
            "6-month course of antibiotics",
            "Directly Observed Treatment (DOTS)",
            "Regular follow-up and testing",
            "Drug-resistant TB requires longer treatment",
            "Nutritional support"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/tuberculosis" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/tuberculosis.html" },
            { name: "RNTCP India", url: "https://tbcindia.gov.in" }
        ],
        keywords: ["tuberculosis", "tb", "lung infection", "bacterial", "dots"],
        research: { term: "tuberculosis", drugs: ["isoniazid", "rifampin", "pyrazinamide", "ethambutol", "bedaquiline"], genes: ["IFNGR1", "IL12RB1"] },
        environment: { regions: ["Highest burden in South-East Asia, Africa and the Western Pacific; India is among the highest-burden countries"], temperature: ["No strong temperature dependence; spread tracks indoor crowding and poor ventilation, which rise in cold seasons"], soil: ["Not soil-borne for humans"], food: ["Undernutrition is a major risk factor", "Unpasteurised milk from infected cattle can carry M. bovis"] }
    },
    {
        id: "typhoid",
        name: "Typhoid Fever",
        category: "Infectious",
        description: "A bacterial infection caused by Salmonella typhi. It spreads through contaminated food and water. Typhoid is common in areas with poor sanitation.",
        causes: [
            "Salmonella typhi bacteria",
            "Contaminated food or water",
            "Poor sanitation and hygiene",
            "Contact with infected persons"
        ],
        riskFactors: [
            "Traveling to endemic areas",
            "Poor access to clean water",
            "Inadequate sanitation",
            "Contact with typhoid carriers",
            "Eating street food"
        ],
        prevention: [
            "Drink safe, treated water",
            "Proper food hygiene",
            "Wash hands frequently",
            "Get vaccinated before traveling",
            "Avoid raw foods in endemic areas"
        ],
        treatment: [
            "Antibiotic therapy",
            "Adequate hydration",
            "Rest",
            "Hospitalization for severe cases",
            "Complete the antibiotic course"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/typhoid" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/typhoidfever.html" }
        ],
        keywords: ["typhoid", "salmonella", "fever", "water-borne", "food poisoning"],
        research: { term: "typhoid fever", drugs: ["ciprofloxacin", "azithromycin", "ceftriaxone"], genes: [] },
        environment: { regions: ["South Asia and sub-Saharan Africa, wherever sanitation and safe water are limited"], temperature: ["Cases often peak in hotter, wetter months when water contamination is more likely"], soil: ["Faecal contamination of soil and sewage can reach water sources and irrigated produce"], food: ["Contaminated water, street food and raw produce washed in unsafe water", "Handwashing and safe food handling reduce risk"] }
    },
    {
        id: "cholera",
        name: "Cholera",
        category: "Infectious",
        description: "An acute diarrheal infection caused by ingesting contaminated food or water. It can be rapidly fatal if untreated but is easily treatable with oral rehydration.",
        causes: [
            "Vibrio cholerae bacteria",
            "Contaminated water",
            "Contaminated food",
            "Poor sanitation"
        ],
        riskFactors: [
            "Lack of clean water access",
            "Poor sanitation",
            "Living in crowded conditions",
            "Natural disasters or emergencies",
            "Consuming raw seafood"
        ],
        prevention: [
            "Safe drinking water",
            "Proper sanitation",
            "Hand washing with soap",
            "Safe food preparation",
            "Oral cholera vaccines in endemic areas"
        ],
        treatment: [
            "Oral Rehydration Solution (ORS)",
            "Intravenous fluids for severe dehydration",
            "Antibiotics in severe cases",
            "Zinc supplements for children",
            "Continued feeding"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/cholera" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/cholera.html" }
        ],
        keywords: ["cholera", "diarrhea", "water-borne", "dehydration", "ors"],
        research: { term: "cholera", drugs: ["doxycycline", "azithromycin"], genes: ["CFTR"] },
        environment: { regions: ["Regions without safe water and sanitation, including parts of Africa, South Asia and Yemen", "Outbreaks after floods, conflict and displacement"], temperature: ["Vibrio cholerae survives in warm coastal and brackish water; outbreaks often follow warm, rainy periods"], soil: ["Faecal contamination of soil and surface water spreads the bacterium"], food: ["Contaminated water, raw or undercooked seafood and unwashed produce", "Oral rehydration is the core of treatment"] }
    },
    {
        id: "asthma",
        name: "Asthma",
        category: "Respiratory",
        description: "A chronic condition affecting the airways in the lungs. The airways become inflamed and narrow, making breathing difficult. Symptoms include wheezing, coughing, and shortness of breath.",
        causes: [
            "Genetic factors",
            "Allergic reactions",
            "Environmental factors",
            "Respiratory infections in childhood"
        ],
        riskFactors: [
            "Family history of asthma or allergies",
            "Exposure to allergens (dust, pollen)",
            "Air pollution",
            "Smoking or secondhand smoke",
            "Obesity",
            "Occupational irritants"
        ],
        prevention: [
            "Identify and avoid triggers",
            "Keep home clean and dust-free",
            "Avoid smoking and smoke exposure",
            "Regular exercise",
            "Maintain healthy weight",
            "Follow asthma action plan"
        ],
        treatment: [
            "Inhaled corticosteroids (preventer)",
            "Quick-relief inhalers (reliever)",
            "Long-acting bronchodilators",
            "Avoiding triggers",
            "Regular monitoring"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/asthma" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/asthma.html" }
        ],
        keywords: ["asthma", "breathing", "wheezing", "inhaler", "respiratory"],
        research: { term: "asthma", drugs: ["albuterol", "budesonide", "fluticasone", "montelukast"], genes: ["ORMDL3", "IL33", "TSLP"] }
    },
    {
        id: "heart-disease",
        name: "Coronary Heart Disease",
        category: "Cardiovascular",
        description: "A condition where the coronary arteries become narrowed or blocked, reducing blood flow to the heart. It can lead to chest pain (angina) or heart attack.",
        causes: [
            "Atherosclerosis (plaque buildup)",
            "High cholesterol",
            "High blood pressure",
            "Smoking",
            "Diabetes"
        ],
        riskFactors: [
            "High blood pressure",
            "High cholesterol",
            "Smoking",
            "Diabetes",
            "Obesity",
            "Sedentary lifestyle",
            "Family history",
            "Stress"
        ],
        prevention: [
            "Healthy diet low in saturated fats",
            "Regular physical activity",
            "Maintain healthy weight",
            "Don't smoke",
            "Limit alcohol",
            "Manage stress",
            "Control blood pressure and cholesterol"
        ],
        treatment: [
            "Lifestyle changes",
            "Medications (statins, aspirin, beta-blockers)",
            "Angioplasty and stenting",
            "Coronary artery bypass surgery",
            "Cardiac rehabilitation"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/coronaryarterydisease.html" },
            { name: "Gov UK", url: "https://www.gov.uk/health-and-social-care" }
        ],
        keywords: ["heart disease", "coronary", "heart attack", "angina", "cardiovascular"],
        research: { term: "coronary artery disease", drugs: ["atorvastatin", "aspirin", "metoprolol", "clopidogrel"], genes: ["LDLR", "PCSK9", "APOB", "LPA"] }
    },
    {
        id: "myocardial-infarction",
        name: "Myocardial Infarction (Heart Attack)",
        category: "Cardiovascular",
        description: "A medical emergency where blood flow to the heart muscle is abruptly cut off, causing tissue damage. It is usually caused by a blockage in one or more of the coronary arteries.",
        causes: [
            "Blockage of coronary arteries (coronary artery disease)",
            "Coronary artery spasm",
            "Tear in the heart artery (spontaneous coronary artery dissection)"
        ],
        riskFactors: [
            "High blood pressure",
            "High cholesterol",
            "Smoking",
            "Diabetes",
            "Obesity",
            "Age (Men > 45, Women > 55)",
            "Family history of heart attacks"
        ],
        prevention: [
            "Control blood pressure and cholesterol",
            "Quit smoking",
            "Exercise regularly",
            "Maintain a healthy weight",
            "Manage stress",
            "Limit alcohol"
        ],
        treatment: [
            "Emergency medical attention (aspirin, nitroglycerin)",
            "Thrombolytic therapy (clot busters)",
            "Angioplasty and stenting",
            "Coronary artery bypass surgery",
            "Cardiac rehabilitation"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/heartattack.html" }
        ],
        keywords: ["heart attack", "myocardial infarction", "chest pain", "cardiovascular"],
        research: { term: "myocardial infarction", drugs: ["aspirin", "clopidogrel", "ticagrelor", "alteplase"], genes: ["PCSK9", "LDLR", "LPA"] }
    },
    {
        id: "heart-failure",
        name: "Heart Failure",
        category: "Cardiovascular",
        description: "A chronic condition where the heart doesn't pump blood as well as it should. It can occur if the heart is too weak or too stiff.",
        causes: [
            "Coronary artery disease",
            "High blood pressure",
            "Heart valve conditions",
            "Damage to heart muscle (cardiomyopathy)",
            "Myocarditis"
        ],
        riskFactors: [
            "High blood pressure",
            "Coronary artery disease",
            "Heart attack",
            "Diabetes",
            "Some diabetes medications",
            "Sleep apnea",
            "Congenital heart defects",
            "Valvular heart disease",
            "Viruses",
            "Alcohol use",
            "Tobacco use"
        ],
        prevention: [
            "Not smoking",
            "Controlling certain conditions, such as high blood pressure and diabetes",
            "Staying physically active",
            "Eating healthy foods",
            "Maintaining a healthy weight",
            "Reducing and managing stress"
        ],
        treatment: [
            "Medications (ACE inhibitors, beta blockers, diuretics)",
            "Surgery and medical devices (defibrillators, pacemakers)",
            "Heart transplant",
            "Lifestyle changes"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/cardiovascular-diseases-(cvds)" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/heartfailure.html" }
        ],
        keywords: ["heart failure", "congestive heart failure", "cardiovascular", "edema", "shortness of breath"],
        research: { term: "heart failure", drugs: ["sacubitril", "carvedilol", "spironolactone", "furosemide", "dapagliflozin"], genes: ["TTN", "MYH7", "LMNA"] }
    },
    {
        id: "anemia",
        name: "Anemia",
        category: "Blood Disorder",
        description: "A condition in which the blood doesn't have enough healthy red blood cells to carry adequate oxygen to tissues. The most common type is iron-deficiency anemia.",
        causes: [
            "Iron deficiency",
            "Vitamin B12 deficiency",
            "Folic acid deficiency",
            "Chronic diseases",
            "Genetic conditions (sickle cell, thalassemia)"
        ],
        riskFactors: [
            "Poor diet lacking iron or vitamins",
            "Heavy menstrual periods",
            "Pregnancy",
            "Chronic conditions",
            "Family history of inherited anemia",
            "Age"
        ],
        prevention: [
            "Iron-rich diet (leafy greens, meat, beans)",
            "Vitamin C to enhance iron absorption",
            "Folic acid and B12 supplementation if needed",
            "Regular health check-ups",
            "Treat underlying conditions"
        ],
        treatment: [
            "Iron supplements",
            "Vitamin B12 injections",
            "Folic acid supplements",
            "Treating underlying cause",
            "Blood transfusion in severe cases"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/health-topics/anaemia" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/anemia.html" }
        ],
        keywords: ["anemia", "iron deficiency", "blood", "hemoglobin", "fatigue"],
        research: { term: "iron deficiency anemia", drugs: ["ferrous sulfate", "cyanocobalamin", "folic acid"], genes: ["HBB", "TMPRSS6", "G6PD"] }
    },
    {
        id: "diarrhea",
        name: "Diarrheal Diseases",
        category: "Gastrointestinal",
        description: "A condition characterized by loose, watery stools occurring more frequently than usual. It can lead to dehydration, especially dangerous in children.",
        causes: [
            "Bacterial infections (E. coli, Salmonella)",
            "Viral infections (rotavirus, norovirus)",
            "Parasitic infections",
            "Contaminated food or water",
            "Food intolerances"
        ],
        riskFactors: [
            "Poor sanitation",
            "Lack of clean water",
            "Malnutrition",
            "Weakened immunity",
            "Travel to developing countries"
        ],
        prevention: [
            "Wash hands with soap regularly",
            "Drink safe, clean water",
            "Proper food handling and cooking",
            "Rotavirus vaccination for children",
            "Breastfeeding for infants"
        ],
        treatment: [
            "Oral Rehydration Solution (ORS)",
            "Zinc supplements for children",
            "Continue feeding",
            "Antibiotics only for specific infections",
            "Seek care if dehydration worsens"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/diarrhoeal-disease" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/diarrhea.html" }
        ],
        keywords: ["diarrhea", "loose stools", "dehydration", "ors", "stomach"],
        research: { term: "diarrhea", drugs: ["loperamide", "rifaximin"], genes: [] }
    },
    {
        id: "cataract",
        name: "Cataract",
        category: "Eye",
        description: "A clouding of the clear lens of the eye. It is the leading cause of blindness worldwide. It generally develops slowly and eventually interferes with vision.",
        causes: [
            "Aging (most common)",
            "Diabetes",
            "Trauma to the eye",
            "Radiation (UV) exposure",
            "Long-term use of corticosteroids"
        ],
        riskFactors: [
            "Increasing age",
            "Diabetes",
            "Excessive exposure to sunlight",
            "Smoking",
            "Obesity",
            "High blood pressure",
            "Previous eye injury or inflammation",
            "Previous eye surgery"
        ],
        prevention: [
            "Regular eye examinations",
            "Quit smoking",
            "Manage other health problems",
            "Choose a healthy diet that includes plenty of fruits and vegetables",
            "Wear sunglasses",
            "Reduce alcohol use"
        ],
        treatment: [
            "Prescription glasses (early stages)",
            "Cataract surgery (removing the cloudy lens and replacing it with an artificial one)"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/cataract.html" }
        ],
        keywords: ["cataract", "blurry vision", "eye", "cloudy lens", "blindness"],
        research: { term: "cataract", drugs: [], genes: ["CRYAA"] }
    },
    {
        id: "glaucoma",
        name: "Glaucoma",
        category: "Eye",
        description: "A group of eye conditions that damage the optic nerve, the health of which is vital for good vision. This damage is often caused by an abnormally high pressure in your eye.",
        causes: [
            "High internal eye pressure (intraocular pressure)",
            "Blocked drainage in your eye",
            "Medications like corticosteroids",
            "Reduced blood flow to your optic nerve"
        ],
        riskFactors: [
            "High internal eye pressure (intraocular pressure)",
            "Being over age 60",
            "Being black, Asian or Hispanic",
            "Family history of glaucoma",
            "Certain medical conditions (diabetes, heart disease, high blood pressure)",
            "Corneas that are thin in the center"
        ],
        prevention: [
            "Get regular dilated eye examinations",
            "Know your family's eye health history",
            "Exercise safely",
            "Take prescribed eye drops regularly",
            "Wear eye protection"
        ],
        treatment: [
            "Eye drops",
            "Oral medications",
            "Laser therapy",
            "Surgery (filtering surgery, drainage tubes)"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/glaucoma.html" }
        ],
        keywords: ["glaucoma", "optic nerve", "eye pressure", "vision loss", "eye"],
        research: { term: "glaucoma", drugs: ["latanoprost", "timolol", "brimonidine", "dorzolamide"], genes: ["MYOC", "OPTN", "CYP1B1"] }
    },
    {
        id: "diabetic-retinopathy",
        name: "Diabetic Retinopathy",
        category: "Eye",
        description: "A diabetes complication that affects eyes. It's caused by damage to the blood vessels of the light-sensitive tissue at the back of the eye (retina).",
        causes: [
            "High blood sugar levels over time",
            "Blockage of tiny blood vessels that nourish the retina",
            "Growth of new, abnormal blood vessels"
        ],
        riskFactors: [
            "Duration of diabetes — the longer you have diabetes, the greater your risk",
            "Poor control of your blood sugar level",
            "High blood pressure",
            "High cholesterol",
            "Pregnancy",
            "Tobacco use"
        ],
        prevention: [
            "Manage your diabetes",
            "Monitor your blood sugar level",
            "Keep your blood pressure and cholesterol under control",
            "Quit smoking"
        ],
        treatment: [
            "Dilated eye exams for early detection",
            "Injecting medications into the eye",
            "Photocoagulation (laser treatment)",
            "Vitrectomy"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/blindness-and-visual-impairment" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/diabeticretinopathy.html" }
        ],
        keywords: ["diabetic retinopathy", "diabetes", "vision loss", "retina", "eye"],
        research: { term: "diabetic retinopathy", drugs: ["aflibercept", "ranibizumab", "faricimab"], genes: ["VEGFA"] }
    },
    {
        id: "bone-tb",
        name: "Bone and Joint Tuberculosis (Skeletal TB)",
        category: "Infectious",
        description: "Tuberculosis that has spread from the lungs or elsewhere to the bones and joints. The spine is the most commonly affected site, where it is known as Pott disease. It develops slowly, so diagnosis is often delayed.",
        causes: [
            "Mycobacterium tuberculosis reaching bone through the bloodstream, usually from a lung or lymph node focus",
            "Reactivation of dormant infection",
            "Less commonly, spread from adjacent infected tissue"
        ],
        riskFactors: [
            "Living with or exposed to active pulmonary TB",
            "HIV/AIDS and other immune suppression",
            "Malnutrition",
            "Diabetes",
            "Crowded living conditions",
            "Residence in a high TB-burden region"
        ],
        prevention: [
            "Finding and treating pulmonary TB early",
            "Completing the full treatment course",
            "BCG vaccination in early childhood where recommended",
            "Good ventilation and infection control",
            "Screening and preventive treatment for high-risk contacts"
        ],
        treatment: [
            "Multi-drug anti-TB regimen, usually the same first-line drugs used for pulmonary TB",
            "Treatment is often longer than for lung TB; duration depends on the guideline and the response",
            "Drug-susceptibility testing, because drug-resistant TB needs a different regimen",
            "Surgery for spinal instability, nerve compression or large abscesses",
            "Bracing, rest and physiotherapy during recovery"
        ],
        sources: [
            { name: "WHO", url: "https://www.who.int/news-room/fact-sheets/detail/tuberculosis" },
            { name: "MedlinePlus", url: "https://medlineplus.gov/tuberculosis.html" },
            { name: "CDC", url: "https://www.cdc.gov/tb/" }
        ],
        keywords: ["bone tb", "skeletal tuberculosis", "pott disease", "spinal tb", "spine", "joint", "tuberculosis", "bone infection"],
        research: { term: "skeletal tuberculosis", drugs: ["isoniazid", "rifampin", "pyrazinamide", "ethambutol"], genes: [] },
        environment: { regions: ["Highest burden where TB is common, including South-East Asia and Africa", "Cases follow the pulmonary TB burden in a community"], temperature: ["No direct temperature dependence; spread follows crowding and poor ventilation, which increase in cold seasons"], soil: ["Not soil-borne"], food: ["Undernutrition raises risk and slows recovery", "Unpasteurised milk from infected cattle can carry M. bovis"] }
    },
    {
        id: "osteomyelitis",
        name: "Osteomyelitis (Bone Infection)",
        category: "Musculoskeletal",
        description: "An infection of the bone, most often bacterial. It can follow an injury, surgery or spread through the blood, and can become long-lasting if untreated.",
        causes: [
            "Bacteria, most commonly Staphylococcus aureus",
            "Open fractures or bone surgery",
            "Spread from a nearby skin or soft-tissue infection, such as a diabetic foot ulcer",
            "Spread through the bloodstream"
        ],
        riskFactors: [
            "Diabetes with foot ulcers",
            "Recent bone injury or surgery",
            "Poor circulation",
            "Weakened immune system",
            "Intravenous drug use"
        ],
        prevention: [
            "Prompt cleaning and care of wounds",
            "Daily foot care in people with diabetes",
            "Good surgical and infection-control practice",
            "Managing diabetes and circulation"
        ],
        treatment: [
            "Prolonged antibiotics, often several weeks, chosen using culture results",
            "Surgical removal of dead or infected bone",
            "Draining abscesses",
            "Treating the underlying cause, such as blood sugar control"
        ],
        sources: [
            { name: "MedlinePlus", url: "https://medlineplus.gov/ency/article/000437.htm" }
        ],
        keywords: ["osteomyelitis", "bone infection", "bone", "staphylococcus"],
        research: { term: "osteomyelitis", drugs: ["cefazolin", "vancomycin", "clindamycin"], genes: [] },
        environment: { regions: ["Worldwide; higher where injuries, diabetes and limited surgical care are common"], temperature: ["No direct temperature dependence"], soil: ["Wounds contaminated with soil can introduce bacteria, so thorough wound cleaning matters"], food: ["Good nutrition supports healing", "No food-borne route"] }
    },
    {
        id: "osteoporosis",
        name: "Osteoporosis",
        category: "Musculoskeletal",
        description: "A condition in which bones lose density and strength, making fractures more likely, most often of the hip, spine and wrist. It usually causes no symptoms until a fracture occurs.",
        causes: [
            "Age-related bone loss",
            "Fall in oestrogen after menopause",
            "Long-term corticosteroid use",
            "Low calcium or vitamin D status over time"
        ],
        riskFactors: [
            "Older age and female sex",
            "Family history of fracture",
            "Low body weight",
            "Smoking and heavy alcohol use",
            "Physical inactivity",
            "Certain conditions and medicines"
        ],
        prevention: [
            "Adequate calcium and vitamin D intake",
            "Weight-bearing and resistance exercise",
            "Not smoking and limiting alcohol",
            "Fall-prevention measures"
        ],
        treatment: [
            "Calcium and vitamin D where intake is low",
            "Bone-strengthening medicines such as bisphosphonates",
            "Fracture-risk assessment",
            "Exercise and falls-prevention programmes"
        ],
        sources: [
            { name: "MedlinePlus", url: "https://medlineplus.gov/osteoporosis.html" },
            { name: "WHO", url: "https://www.who.int/health-topics/musculoskeletal-conditions" }
        ],
        keywords: ["osteoporosis", "bone density", "fracture", "bone loss", "calcium"],
        research: { term: "osteoporosis", drugs: ["alendronate", "denosumab", "zoledronic acid"], genes: ["LRP5", "COL1A1"] },
        environment: { regions: ["Worldwide; fracture rates differ by region and are higher in older populations"], temperature: ["Little direct effect; low sunlight at high latitudes and in winter reduces skin vitamin D production"], soil: ["Not soil-borne"], food: ["Dietary calcium, vitamin D and protein support bone health", "Very low intake of any of these raises risk"] }
    },
    {
        id: "pneumonia",
        name: "Pneumonia",
        category: "Respiratory",
        description: "An infection that inflames the air sacs in one or both lungs, which may fill with fluid or pus. It is a leading infectious cause of death in children under five worldwide, and it is preventable and treatable.",
        causes: ["Bacteria such as Streptococcus pneumoniae", "Viruses including influenza and RSV", "Fungi, mainly in people with weakened immunity", "Inhaling food, liquid or vomit (aspiration)"],
        riskFactors: ["Age under 5 or over 65", "Malnutrition and not being breastfed in infancy", "Smoking and indoor air pollution from cooking fuels", "Chronic lung, heart or kidney disease", "HIV or other immune suppression"],
        prevention: ["Vaccination, including pneumococcal, Hib, measles and influenza", "Exclusive breastfeeding for the first six months", "Cleaner household energy and less indoor smoke", "Handwashing", "Not smoking"],
        treatment: ["Antibiotics for bacterial pneumonia, chosen by severity and local guidance", "Oxygen for low blood oxygen", "Fluids and rest", "Hospital care for severe cases, infants and older adults", "Early care-seeking when breathing is fast or difficult"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/pneumonia"}, {"name": "MedlinePlus", "url": "https://medlineplus.gov/pneumonia.html"}],
        keywords: ["pneumonia", "lung infection", "chest infection", "cough", "breathing"],
        research: { term: "pneumonia", drugs: ["amoxicillin", "azithromycin", "ceftriaxone"], genes: [] },
        environment: { regions: ["Highest child deaths in sub-Saharan Africa and South Asia"], temperature: ["More cases in cold and winter or rainy seasons, when people crowd indoors"], soil: ["Not soil-borne; dust and smoke exposure raise risk"], food: ["Malnutrition weakens defences", "Exclusive breastfeeding is protective in infancy"] }
    },
    {
        id: "stroke",
        name: "Stroke",
        category: "Cardiovascular",
        description: "A sudden loss of blood flow to part of the brain (ischaemic) or bleeding in the brain (haemorrhagic). It is a medical emergency, and fast treatment limits brain damage.",
        causes: ["Blood clot blocking a brain artery", "Burst or leaking blood vessel in the brain", "Atrial fibrillation causing clots", "Long-term damage to blood vessels from high blood pressure"],
        riskFactors: ["High blood pressure", "Diabetes", "High cholesterol", "Smoking", "Atrial fibrillation", "Obesity and inactivity"],
        prevention: ["Controlling blood pressure", "Not smoking", "Healthy diet and regular activity", "Managing diabetes and cholesterol", "Treating atrial fibrillation"],
        treatment: ["Emergency care as soon as possible; every minute counts", "Clot-dissolving drugs or clot removal for ischaemic stroke within the treatment window", "Surgery or blood-pressure control for bleeding strokes", "Rehabilitation including physiotherapy and speech therapy", "Long-term medicines to prevent another stroke"],
        sources: [{"name": "MedlinePlus", "url": "https://medlineplus.gov/stroke.html"}, {"name": "WHO", "url": "https://www.who.int/health-topics/cardiovascular-diseases"}],
        keywords: ["stroke", "brain attack", "paralysis", "face drooping", "brain"],
        research: { term: "stroke", drugs: ["alteplase", "aspirin", "clopidogrel", "atorvastatin"], genes: [] },
        environment: { regions: ["Burden is highest in low- and middle-income countries, including parts of Asia and Africa"], temperature: ["Some studies link stroke rates to very cold or very hot days; the effect is modest compared with blood pressure"], soil: ["Not soil-borne"], food: ["High salt intake raises blood pressure and stroke risk", "Diets rich in fruit and vegetables lower it"] }
    },
    {
        id: "hepatitis-b",
        name: "Hepatitis B",
        category: "Infectious",
        description: "A viral infection of the liver. It can be short-lived or become chronic, and chronic infection can lead to cirrhosis and liver cancer. A safe, effective vaccine prevents it.",
        causes: ["Hepatitis B virus", "Transmission from mother to child at birth", "Contact with infected blood or body fluids", "Unsafe injections or unscreened transfusions"],
        riskFactors: ["Being born to an infected mother", "Unvaccinated healthcare workers", "Sharing needles", "Unprotected sex with an infected partner", "Living in a high-prevalence region"],
        prevention: ["Vaccination, starting with a birth dose", "Screening pregnant women and treating when needed", "Safe injections and blood screening", "Safer sex practices"],
        treatment: ["Most acute infections clear with supportive care", "Antiviral medicines for chronic infection that needs treatment", "Regular liver monitoring", "Avoiding alcohol", "Liver cancer surveillance for people at risk"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b"}, {"name": "MedlinePlus", "url": "https://medlineplus.gov/hepatitisb.html"}],
        keywords: ["hepatitis b", "hbv", "liver infection", "jaundice", "liver"],
        research: { term: "hepatitis B", drugs: ["tenofovir", "entecavir"], genes: [] },
        environment: { regions: ["Highest prevalence in the Western Pacific and Africa; also present in South Asia"], temperature: ["No direct temperature dependence"], soil: ["Not soil-borne"], food: ["Not food-borne", "Good nutrition and avoiding alcohol protect the liver"] }
    },
    {
        id: "hiv-aids",
        name: "HIV/AIDS",
        category: "Infectious",
        description: "HIV is a virus that attacks the immune system. Without treatment it can progress to AIDS. With modern antiretroviral therapy, people with HIV can live long, healthy lives and not pass the virus on sexually.",
        causes: ["Human immunodeficiency virus", "Unprotected sex", "Sharing needles", "Mother-to-child transmission during pregnancy, birth or breastfeeding", "Unscreened blood transfusion"],
        riskFactors: ["Unprotected sex with multiple partners", "Sharing injecting equipment", "Other sexually transmitted infections", "Not knowing one's HIV status", "Living in a high-prevalence region"],
        prevention: ["Condoms", "Pre-exposure prophylaxis (PrEP) for people at high risk", "Regular testing", "Treating HIV early so the viral load stays undetectable", "Preventing mother-to-child transmission with medicines"],
        treatment: ["Lifelong antiretroviral therapy", "Regular viral-load and CD4 monitoring", "Preventing and treating TB and other infections", "Counselling and adherence support", "Nutrition support"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/hiv-aids"}, {"name": "MedlinePlus", "url": "https://medlineplus.gov/hivaids.html"}],
        keywords: ["hiv", "aids", "immune", "antiretroviral", "art"],
        research: { term: "HIV", drugs: ["dolutegravir", "tenofovir", "emtricitabine"], genes: ["CCR5"] },
        environment: { regions: ["Highest burden in sub-Saharan Africa; concentrated epidemics elsewhere"], temperature: ["No direct temperature dependence"], soil: ["Not soil-borne"], food: ["Malnutrition worsens outcomes", "Good nutrition supports treatment"] }
    },
    {
        id: "depression",
        name: "Depression",
        category: "Mental health",
        description: "A common mental health condition with persistent low mood or loss of interest that affects daily life. It is treatable, and many people recover with the right support.",
        causes: ["A mix of biological, psychological and social factors", "Family history", "Stressful life events, loss or trauma", "Long-term illness or pain"],
        riskFactors: ["Previous depression", "Chronic physical illness", "Isolation and loss of support", "Substance misuse", "Financial and work stress"],
        prevention: ["Staying connected with family and friends", "Regular physical activity and sleep", "Early help during stressful periods", "School and community mental health programmes"],
        treatment: ["Talking therapies such as cognitive behavioural therapy", "Antidepressant medicines for moderate to severe depression", "Support groups and community care", "Treating co-existing conditions", "Urgent help if there are thoughts of self-harm"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/depression"}, {"name": "MedlinePlus", "url": "https://medlineplus.gov/depression.html"}],
        keywords: ["depression", "low mood", "mental health", "sadness", "anxiety"],
        research: { term: "depression", drugs: ["sertraline", "fluoxetine", "escitalopram"], genes: [] },
        environment: { regions: ["Occurs worldwide; access to care varies widely between regions"], temperature: ["Reduced sunlight in winter at high latitudes can worsen mood in some people"], soil: ["Not soil-borne"], food: ["Poor diet and deficiencies can affect mood", "Regular meals and good nutrition support recovery"] }
    },
    {
        id: "chronic-kidney-disease",
        name: "Chronic Kidney Disease",
        category: "Renal",
        description: "A long-term, gradual loss of kidney function. Early disease often has no symptoms, so it is found by blood and urine tests. Treatment slows progression.",
        causes: ["Diabetes", "High blood pressure", "Glomerular diseases", "Long-term kidney infections or blockage", "Inherited conditions such as polycystic kidney disease"],
        riskFactors: ["Diabetes and hypertension", "Family history", "Older age", "Obesity", "Long-term use of some painkillers (NSAIDs)", "Chronic exposure to heat stress or certain toxins in some regions"],
        prevention: ["Controlling blood sugar and blood pressure", "Not smoking", "Avoiding unnecessary painkillers", "Yearly kidney checks if at risk", "Staying hydrated"],
        treatment: ["Blood-pressure and diabetes control", "Medicines that protect the kidneys", "Diet changes, including limiting salt", "Dialysis or transplant for kidney failure", "Regular monitoring by a specialist"],
        sources: [{"name": "MedlinePlus", "url": "https://medlineplus.gov/kidneydiseases.html"}, {"name": "WHO", "url": "https://www.who.int/health-topics/noncommunicable-diseases"}],
        keywords: ["kidney", "ckd", "renal", "dialysis", "creatinine"],
        research: { term: "chronic kidney disease", drugs: ["losartan", "dapagliflozin", "empagliflozin"], genes: ["APOL1", "UMOD"] },
        environment: { regions: ["Found worldwide; a form not tied to diabetes or hypertension is reported among agricultural workers in some hot regions, including parts of South Asia and Central America"], temperature: ["Repeated heat stress and dehydration are studied as risk factors in outdoor workers"], soil: ["Contaminated water or soil with heavy metals or agrochemicals is investigated as a possible factor; evidence is still developing"], food: ["High salt intake raises risk", "Staying hydrated protects the kidneys"] }
    },
    {
        id: "osteoarthritis",
        name: "Osteoarthritis",
        category: "Musculoskeletal",
        description: "A degenerative joint disease in which cartilage wears down, causing pain, stiffness and reduced movement. It most often affects the knees, hips, hands and spine.",
        causes: ["Wear and loss of joint cartilage over time", "Previous joint injury", "Excess load on joints from obesity", "Genetic factors"],
        riskFactors: ["Older age", "Obesity", "Joint injury", "Repetitive heavy use of a joint", "Family history", "Female sex"],
        prevention: ["Keeping a healthy weight", "Regular low-impact exercise", "Protecting joints from injury", "Using correct technique at work and sport"],
        treatment: ["Exercise and physiotherapy", "Weight loss where relevant", "Pain relief with paracetamol or anti-inflammatory drugs", "Joint injections in selected cases", "Joint replacement for severe disease"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/osteoarthritis"}, {"name": "MedlinePlus", "url": "https://medlineplus.gov/osteoarthritis.html"}],
        keywords: ["osteoarthritis", "arthritis", "joint pain", "knee", "cartilage"],
        research: { term: "osteoarthritis", drugs: ["acetaminophen", "ibuprofen", "diclofenac"], genes: ["GDF5"] },
        environment: { regions: ["Worldwide; knee osteoarthritis is common in India and other regions where squatting and floor sitting are routine"], temperature: ["Cold and damp weather can make symptoms feel worse; it does not cause the disease"], soil: ["Not soil-borne"], food: ["Healthy weight lowers joint load", "No diet has been shown to cure it"] }
    },
    {
        id: "rickets",
        name: "Rickets and Vitamin D Deficiency",
        category: "Nutritional",
        description: "A childhood bone disease in which bones soften and bend because of too little vitamin D, calcium or phosphate. In adults, the equivalent is osteomalacia. It is common where sunlight exposure or diet is limited.",
        causes: ["Too little vitamin D from sunlight or food", "Low dietary calcium", "Malabsorption conditions", "Rare inherited disorders of phosphate handling"],
        riskFactors: ["Dark skin with limited sun exposure", "Covered clothing and mostly indoor living", "Exclusive breastfeeding without vitamin D supplements", "Premature birth", "Malnutrition"],
        prevention: ["Safe, regular sun exposure", "Vitamin D supplements for infants where advised", "Calcium-rich foods", "Fortified foods"],
        treatment: ["Vitamin D and calcium supplements", "Treating the underlying cause", "Bracing or surgery for severe deformity", "Dietary advice"],
        sources: [{"name": "MedlinePlus", "url": "https://medlineplus.gov/rickets.html"}, {"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/malnutrition"}],
        keywords: ["rickets", "vitamin d", "bone", "osteomalacia", "calcium", "bow legs"],
        research: { term: "rickets", drugs: ["cholecalciferol", "calcium carbonate", "ergocalciferol"], genes: ["VDR", "CYP27B1"] },
        environment: { regions: ["Reported worldwide, including sunny regions where people cover up or stay indoors, and in northern latitudes"], temperature: ["Less sunlight in winter and at high latitudes lowers skin vitamin D production"], soil: ["Not soil-borne"], food: ["Oily fish, eggs and fortified foods provide vitamin D", "Dairy, leafy greens and fortified foods provide calcium"] }
    },
    {
        id: "fluorosis",
        name: "Fluorosis",
        category: "Environmental",
        description: "A condition caused by long-term intake of too much fluoride, usually from drinking water. It stains and damages teeth and, at higher exposure, causes skeletal fluorosis with stiff, painful joints and bone changes. It is a recognised problem in parts of India.",
        causes: ["Drinking water with naturally high fluoride", "Fluoride-rich groundwater from certain rock types", "Industrial pollution in some areas", "High intake of some teas or fluoride-rich foods"],
        riskFactors: ["Living where groundwater fluoride is high", "Low calcium and poor nutrition, which worsen effects", "Children, whose teeth are still forming", "Long-term exposure"],
        prevention: ["Testing drinking water and using low-fluoride sources", "Defluoridation filters", "Adequate calcium, vitamin C and nutrition", "Avoiding fluoride toothpaste swallowing in young children"],
        treatment: ["Removing the fluoride source", "Nutritional support", "Dental treatment for fluorosed teeth", "Pain management and physiotherapy for skeletal fluorosis", "There is no cure for established skeletal changes, so prevention matters"],
        sources: [{"name": "WHO", "url": "https://www.who.int/teams/environment-climate-change-and-health/water-sanitation-and-health/chemical-hazards-in-drinking-water/fluoride"}],
        keywords: ["fluorosis", "fluoride", "water", "teeth", "skeletal fluorosis", "groundwater"],
        research: { term: "fluorosis", drugs: [], genes: [] },
        environment: { regions: ["Reported in parts of India, China, East Africa and the Middle East where groundwater fluoride is high"], temperature: ["Hot climates mean people drink more water, which raises fluoride intake"], soil: ["Fluoride dissolves from certain rocks and soils into groundwater"], food: ["Poor nutrition, especially low calcium, makes the effects worse", "Some teas can add fluoride"] }
    },
    {
        id: "malnutrition",
        name: "Malnutrition",
        category: "Nutritional",
        description: "Deficiencies, excesses or imbalances in a person's energy and nutrient intake. It includes undernutrition (stunting, wasting, underweight), micronutrient deficiencies, and overweight and obesity.",
        causes: ["Not enough food or poor diet quality", "Repeated infections, especially diarrhoea", "Poverty and food insecurity", "Poor feeding practices in infancy"],
        riskFactors: ["Low income", "Lack of clean water and sanitation", "Frequent childhood infections", "Not being breastfed in infancy", "Chronic illness"],
        prevention: ["Exclusive breastfeeding for six months, then suitable foods", "Diverse diets with enough protein, fruit and vegetables", "Clean water and sanitation", "Vaccination and prompt treatment of infections", "Micronutrient supplements where advised"],
        treatment: ["Therapeutic foods for severe acute malnutrition", "Treating infections", "Micronutrient supplements such as iron, vitamin A and zinc", "Nutrition counselling", "Community feeding programmes"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/malnutrition"}, {"name": "MedlinePlus", "url": "https://medlineplus.gov/malnutrition.html"}],
        keywords: ["malnutrition", "undernutrition", "stunting", "wasting", "nutrition", "underweight"],
        research: { term: "malnutrition", drugs: [], genes: [] },
        environment: { regions: ["Highest undernutrition burden in South Asia and sub-Saharan Africa; overweight is rising worldwide"], temperature: ["Heat, drought and floods can disrupt harvests and food supply"], soil: ["Soil quality, such as depleted zinc, iodine or selenium, affects the nutrient content of local crops"], food: ["Dietary diversity is the key factor", "Diarrhoeal infections reduce nutrient absorption"] }
    },
    {
        id: "chikungunya",
        name: "Chikungunya",
        category: "Infectious",
        description: "A viral infection spread by Aedes mosquitoes, causing sudden fever and severe joint pain. The joint pain can last for weeks or months. There is no specific antiviral treatment.",
        causes: ["Chikungunya virus", "Bites from infected Aedes aegypti and Aedes albopictus mosquitoes", "Rarely, mother-to-newborn transmission around birth"],
        riskFactors: ["Living in or travelling to tropical and subtropical areas", "Standing water near homes", "Older age and existing joint disease for longer-lasting symptoms", "Newborns"],
        prevention: ["Removing standing water where mosquitoes breed", "Repellents and long sleeves", "Window screens and bed nets", "Community mosquito control", "Vaccines are available in some countries"],
        treatment: ["Rest and fluids", "Pain and fever relief with paracetamol; avoid aspirin and NSAIDs until dengue is excluded", "Physiotherapy for persistent joint pain", "Medical review if symptoms are severe"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/chikungunya"}],
        keywords: ["chikungunya", "joint pain", "mosquito", "aedes", "fever"],
        research: { term: "chikungunya", drugs: ["acetaminophen"], genes: [] },
        environment: { regions: ["Africa, Asia, the Americas and parts of Europe; India has had repeated outbreaks"], temperature: ["Outbreaks follow warm, humid weather and the rainy season"], soil: ["Not soil-borne; larvae develop in water in containers, tyres and coolers"], food: ["Not food-borne", "Fluids and nutrition support recovery"] }
    },
    {
        id: "rabies",
        name: "Rabies",
        category: "Infectious",
        description: "A viral disease of the nervous system spread by the saliva of infected animals, most often dogs. It is almost always fatal once symptoms appear, but it is entirely preventable with prompt wound care and post-exposure vaccination.",
        causes: ["Rabies virus", "Bites or scratches from infected animals, mainly dogs", "Saliva contact with broken skin or mucous membranes"],
        riskFactors: ["Living where dog rabies is uncontrolled", "Children, who are bitten more often", "Contact with bats or wildlife", "Working with animals", "Delay in cleaning wounds and getting vaccinated"],
        prevention: ["Vaccinating dogs", "Washing the wound with soap and water for at least 15 minutes", "Post-exposure prophylaxis after any suspected exposure", "Pre-exposure vaccination for people at high risk", "Teaching safe behaviour around animals"],
        treatment: ["Thorough wound washing straight away", "Rabies vaccine series started promptly", "Rabies immunoglobulin for severe exposures", "Seek care even if the animal seemed healthy", "No effective treatment once symptoms start"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/rabies"}],
        keywords: ["rabies", "dog bite", "animal bite", "hydrophobia", "vaccine"],
        research: { term: "rabies", drugs: [], genes: [] },
        environment: { regions: ["Most human deaths occur in Asia and Africa; India accounts for a large share of the global burden"], temperature: ["No direct temperature dependence"], soil: ["Not soil-borne"], food: ["Not food-borne"] }
    },
    {
        id: "leprosy",
        name: "Leprosy (Hansen's Disease)",
        category: "Infectious",
        description: "A long-term bacterial infection that mainly affects the skin and peripheral nerves. It is curable with multidrug therapy, and early treatment prevents disability. It is not highly contagious.",
        causes: ["Mycobacterium leprae", "Prolonged close contact with an untreated person, probably through respiratory droplets"],
        riskFactors: ["Living with an untreated person", "Poverty and crowding", "Malnutrition", "Residence in an endemic region"],
        prevention: ["Early detection and treatment", "Examining close contacts", "Preventive medicine for contacts in some programmes", "Education to reduce stigma"],
        treatment: ["Multidrug therapy provided free through national programmes", "Treating nerve damage and reactions", "Care of numb hands and feet to avoid injury", "Rehabilitation and support"],
        sources: [{"name": "WHO", "url": "https://www.who.int/news-room/fact-sheets/detail/leprosy"}],
        keywords: ["leprosy", "hansen", "skin patches", "numbness", "nerve"],
        research: { term: "leprosy", drugs: ["dapsone", "rifampin", "clofazimine"], genes: [] },
        environment: { regions: ["Cases are reported in India, Brazil and Indonesia, with a smaller number across Africa and elsewhere"], temperature: ["No direct temperature dependence"], soil: ["The bacterium has been found in soil in some studies; its role in spread is not settled"], food: ["Undernutrition raises risk"] }
    }
];

export const searchDiseases = (query: string): Disease[] => {
    const lowerQuery = query.toLowerCase().trim();
    if (!lowerQuery) return [];

    return diseases.filter(disease =>
        disease.name.toLowerCase().includes(lowerQuery) ||
        disease.keywords.some(keyword => keyword.toLowerCase().includes(lowerQuery)) ||
        disease.category.toLowerCase().includes(lowerQuery)
    );
};

export const getDiseaseById = (id: string): Disease | undefined => {
    return diseases.find(disease => disease.id === id);
};

export const categories = [...new Set(diseases.map(d => d.category))].sort();

/** The Lab's condition list is derived from here — never hard-coded on the Lab side. */
export const modelledConditions = diseases.filter(d => d.labModel);
