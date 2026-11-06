/**
 * What the 3D body on Learn says about each organ. The signs and conditions come from the earlier body map and
 * the part descriptions from the earlier organ explorer, unchanged. It is a reference index, not a symptom checker:
 * it lists conditions that can involve an organ, and never ranks them or suggests a diagnosis.
 */
export type OrganId = "heart" | "lungs" | "brain";

export interface Part {
    id: string;
    label: string;
    text: string;
    conditions: string[];
}

export interface Organ {
    title: string;
    intro: string;
    parts: Part[];
}

export const ORGANS: Record<OrganId, Organ> = {
    heart: {
        title: "The heart",
        intro: "A muscular pump about the size of a fist with four chambers. The right side sends blood to the lungs; the left side sends it around the body. Shown from the front, so the heart's right side is on your left.",
        parts: [
            { id: "ra", label: "Right atrium", text: "Collects oxygen-poor blood returning from the body through the venae cavae, then passes it through the tricuspid valve into the right ventricle.", conditions: [] },
            { id: "rv", label: "Right ventricle", text: "Pumps oxygen-poor blood through the pulmonary valve into the pulmonary artery and on to the lungs. Its wall is thinner than the left ventricle's because the lungs need lower pressure.", conditions: ["heart-failure"] },
            { id: "la", label: "Left atrium", text: "Receives oxygen-rich blood from the lungs through the pulmonary veins and passes it through the mitral valve into the left ventricle.", conditions: [] },
            { id: "lv", label: "Left ventricle", text: "The main pumping chamber. Its thick, muscular wall pushes oxygen-rich blood through the aortic valve into the aorta and around the body. Long-term high blood pressure can thicken and stiffen it.", conditions: ["hypertension", "heart-failure", "myocardial-infarction"] },
            { id: "septum", label: "Septum", text: "The muscular wall between the right and left sides. It keeps oxygen-poor and oxygen-rich blood apart.", conditions: [] },
            { id: "valves", label: "Heart valves", text: "Four one-way valves keep blood moving forward: tricuspid (right atrium to right ventricle), pulmonary (right ventricle to pulmonary artery), mitral (left atrium to left ventricle) and aortic (left ventricle to aorta). Their closing makes the 'lub-dub' sound of the heartbeat.", conditions: [] },
            { id: "aorta", label: "Aorta", text: "The body's largest artery. It carries oxygen-rich blood from the left ventricle, arches over the heart and runs down through the chest and abdomen, branching to supply every organ.", conditions: ["hypertension"] },
            { id: "pa", label: "Pulmonary artery", text: "Carries oxygen-poor blood from the right ventricle to both lungs to pick up oxygen. After birth it is the only artery that carries oxygen-poor blood.", conditions: [] },
            { id: "vc", label: "Venae cavae", text: "The superior and inferior venae cavae are the large veins that bring oxygen-poor blood back from the upper and lower body into the right atrium.", conditions: [] },
            { id: "pv", label: "Pulmonary veins", text: "Bring oxygen-rich blood from the lungs back to the left atrium.", conditions: [] },
            { id: "coronary", label: "Coronary arteries", text: "Wrap around the outside of the heart and supply the heart muscle itself with blood. A blockage in one of them starves part of the muscle of oxygen and causes a heart attack.", conditions: ["heart-disease", "myocardial-infarction"] },
            { id: "sa", label: "SA node", text: "The sinoatrial node is the heart's natural pacemaker. It fires the electrical signal that starts each heartbeat, usually 60 to 100 times a minute at rest.", conditions: [] },
        ],
    },
    lungs: {
        title: "The lungs",
        intro: "Two spongy organs that move oxygen into the blood and carbon dioxide out. Air travels down the windpipe, through branching airways, into tiny air sacs. Shown from the front.",
        parts: [
            { id: "trachea", label: "Trachea (windpipe)", text: "A tube held open by C-shaped rings of cartilage. It carries air from the throat into the chest, where it splits into the two main bronchi.", conditions: [] },
            { id: "bronchi", label: "Bronchi", text: "Airways that branch again and again into smaller bronchioles. In asthma their walls swell and tighten, narrowing the airway and causing wheeze.", conditions: ["asthma"] },
            { id: "rlung", label: "Right lung", text: "Has three lobes (upper, middle and lower) and is slightly larger than the left. Tuberculosis often settles in the upper lobes.", conditions: ["tuberculosis", "pneumonia", "covid-19"] },
            { id: "llung", label: "Left lung", text: "Has two lobes and a notch on its inner side, the cardiac notch, that makes room for the heart.", conditions: ["tuberculosis", "pneumonia"] },
            { id: "alveoli", label: "Alveoli", text: "Hundreds of millions of tiny air sacs where oxygen passes into the blood and carbon dioxide passes out. In pneumonia they fill with fluid or pus, which makes breathing hard.", conditions: ["pneumonia", "covid-19"] },
            { id: "diaphragm", label: "Diaphragm", text: "A dome-shaped muscle under the lungs. When it contracts and flattens, the chest expands and air is drawn in; when it relaxes, air flows out.", conditions: [] },
        ],
    },
    brain: {
        title: "The brain",
        intro: "The control centre for thought, movement, senses and automatic body functions. Shown from the left side, with the front of the head on your left.",
        parts: [
            { id: "frontal", label: "Frontal lobe", text: "Planning, decision-making, personality, speech production and voluntary movement. The motor strip at its back edge controls movement on the opposite side of the body.", conditions: ["stroke", "depression"] },
            { id: "parietal", label: "Parietal lobe", text: "Processes touch, temperature and pain, and helps judge space, size and the position of the body.", conditions: ["stroke"] },
            { id: "temporal", label: "Temporal lobe", text: "Hearing, memory and understanding language.", conditions: ["stroke"] },
            { id: "occipital", label: "Occipital lobe", text: "The main visual centre. It turns signals from the eyes into the images we see.", conditions: ["stroke"] },
            { id: "cerebellum", label: "Cerebellum", text: "Coordinates balance, posture and smooth, accurate movement.", conditions: [] },
            { id: "brainstem", label: "Brainstem", text: "Connects the brain to the spinal cord and runs automatic functions such as breathing, heart rate and swallowing.", conditions: ["rabies"] },
        ],
    },
};

export type MeshId =
    | "skin" | "brain" | "eye-l" | "eye-r" | "lungs" | "heart" | "vessels" | "liver" | "pancreas" | "spleen"
    | "kidney-l" | "kidney-r" | "small-intestine" | "large-intestine" | "bladder" | "spine" | "pelvis" | "knee-l" | "knee-r";

/** Colour for each model. The shell is drawn separately, as a glass outline. */
export const MESH_COLOURS: Record<MeshId, string> = {
    skin: "#8fb7ff",
    brain: "#e6b8b0",
    "eye-l": "#dfe8f0",
    "eye-r": "#dfe8f0",
    lungs: "#e79aa8",
    heart: "#d8504f",
    vessels: "#b5363c",
    liver: "#9c4a3a",
    pancreas: "#e3bb6a",
    spleen: "#8e3f5c",
    "kidney-l": "#b5616a",
    "kidney-r": "#b5616a",
    "small-intestine": "#dc9f86",
    "large-intestine": "#c98a6e",
    bladder: "#d9b36f",
    spine: "#f0d98a",
    pelvis: "#e7ddc6",
    "knee-l": "#e7ddc6",
    "knee-r": "#e7ddc6",
};

export interface AtlasRegion {
    id: string;
    label: string;
    meshes: MeshId[];
    signs: string;
    /** Where it sits, where the library says so. */
    where?: string;
    /** Ids from knowledge.ts. A test checks each exists, and that every condition is reachable. */
    conditions: string[];
    /** The fuller part-by-part text, where the library has it. */
    organ?: OrganId;
}

export const ATLAS_REGIONS: AtlasRegion[] = [
    {
        id: "brain",
        label: "Head and brain",
        meshes: ["brain"],
        signs: "Headache, confusion, sudden weakness on one side, face drooping, seizures, low mood.",
        conditions: ["stroke", "depression", "rabies", "dengue", "malaria"],
        organ: "brain",
    },
    {
        id: "eyes",
        label: "Eyes",
        meshes: ["eye-l", "eye-r"],
        signs: "Blurred or cloudy vision, loss of side vision, dark spots or floaters.",
        conditions: ["cataract", "glaucoma", "diabetic-retinopathy", "diabetes"],
    },
    {
        id: "lungs",
        label: "Lungs and chest",
        meshes: ["lungs"],
        signs: "Cough, breathlessness, wheeze, chest tightness, coughing up blood in some infections.",
        conditions: ["tuberculosis", "pneumonia", "asthma", "covid-19"],
        organ: "lungs",
    },
    {
        id: "heart",
        label: "Heart and circulation",
        meshes: ["heart"],
        signs: "Chest pressure, breathlessness, palpitations, swollen ankles, often no symptoms in high blood pressure.",
        where: "The heart sits just left of centre, behind the breastbone, between the lungs.",
        conditions: ["heart-disease", "myocardial-infarction", "heart-failure", "hypertension"],
        organ: "heart",
    },
    {
        id: "liver",
        label: "Liver",
        meshes: ["liver"],
        signs: "Jaundice, abdominal pain, loss of appetite.",
        conditions: ["hepatitis-b"],
    },
    {
        id: "pancreas",
        label: "Pancreas",
        meshes: ["pancreas"],
        signs: "Where insulin is made. Type 1 diabetes destroys insulin-producing cells; type 2 combines insulin resistance with too little insulin.",
        conditions: ["diabetes"],
    },
    {
        id: "gut",
        label: "Stomach and gut",
        meshes: ["small-intestine", "large-intestine"],
        signs: "Abdominal pain, vomiting, watery or frequent stools, loss of appetite.",
        conditions: ["typhoid", "cholera", "diarrhea", "malnutrition"],
    },
    {
        id: "kidneys",
        label: "Kidneys",
        meshes: ["kidney-l", "kidney-r", "bladder"],
        signs: "Swelling of face or legs, tiredness, changes in urination. Early disease often has no signs.",
        conditions: ["chronic-kidney-disease", "diabetes", "hypertension"],
    },
    {
        id: "bones",
        label: "Bones, joints and spine",
        meshes: ["pelvis", "knee-l", "knee-r", "spine"],
        signs: "Bone or joint pain, stiffness, swelling, back pain, bending of bones in children, fractures.",
        conditions: ["bone-tb", "osteomyelitis", "osteoporosis", "osteoarthritis", "rickets", "fluorosis", "chikungunya"],
    },
    {
        id: "skin",
        label: "Skin and nerves",
        meshes: ["skin"],
        signs: "Rash, pale or numb patches, loss of feeling in hands or feet.",
        conditions: ["leprosy", "dengue", "chikungunya"],
    },
    {
        id: "blood",
        label: "Whole body and blood",
        meshes: ["vessels"],
        signs: "Fever, tiredness, pallor, weight loss, repeated infections.",
        conditions: ["anemia", "hiv-aids", "malaria", "dengue", "malnutrition", "diabetes"],
    },
];

/** Drawn for context, with nothing recorded against it in this library. */
export const CONTEXT_MESHES: MeshId[] = ["spleen"];

export const regionOfMesh = (mesh: MeshId): AtlasRegion | undefined => ATLAS_REGIONS.find((r) => r.meshes.includes(mesh));
