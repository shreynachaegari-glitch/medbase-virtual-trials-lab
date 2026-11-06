/**
 * Plain-language text for the 3D anatomy explorer. Part names come from BodyParts3D (FMA names such as
 * "Left kidney" or "Hepatovenous segment VII"); `describePart` matches them to the entries below, most
 * specific first, and falls back to the system's summary. Educational only, not medical advice.
 */
export type SystemId =
    | "skeletal"
    | "muscular"
    | "nervous"
    | "cardiovascular"
    | "respiratory"
    | "digestive"
    | "urinary"
    | "glands"
    | "integumentary";

export const SYSTEM_INFO: Record<SystemId, { label: string; summary: string; keyFacts: string[]; related: string[] }> = {
    skeletal: {
        label: "Skeletal",
        summary: "The adult skeleton has about 206 bones. It supports the body, protects organs such as the brain and heart, anchors muscles for movement, stores calcium and makes blood cells in the bone marrow.",
        keyFacts: ["Bone is living tissue that is constantly broken down and rebuilt.", "Joints link bones and let them move."],
        related: ["osteoporosis", "osteoarthritis", "bone-tb", "osteomyelitis", "rickets", "fluorosis"],
    },
    muscular: {
        label: "Muscular",
        summary: "Skeletal muscles pull on bones through tendons to move the body, hold posture and produce heat. They work in pairs: when one contracts, the opposing muscle relaxes.",
        keyFacts: ["There are more than 600 skeletal muscles.", "Shown faintly by default so the organs inside stay visible."],
        related: [],
    },
    nervous: {
        label: "Nervous",
        summary: "The brain and spinal cord form the central nervous system; nerves carry signals between them and the rest of the body. Together they control movement, sensation, thought and automatic functions such as breathing.",
        keyFacts: ["The brain uses about a fifth of the body's energy at rest.", "Each side of the brain mainly controls the opposite side of the body."],
        related: ["stroke", "depression", "rabies"],
    },
    cardiovascular: {
        label: "Cardiovascular",
        summary: "The heart pumps blood through arteries to every tissue, and veins bring it back. Blood carries oxygen and nutrients to cells and takes away carbon dioxide and waste.",
        keyFacts: ["Arteries are shown in red and veins in blue.", "The adult heart beats roughly 60 to 100 times a minute at rest."],
        related: ["heart-disease", "hypertension", "heart-failure", "myocardial-infarction", "stroke"],
    },
    respiratory: {
        label: "Respiratory",
        summary: "Air passes through the windpipe and branching bronchi into the lungs, where oxygen enters the blood and carbon dioxide leaves it. The lung outlines here are drawn see-through so the airway tree inside shows.",
        keyFacts: ["The right lung has three lobes and the left has two.", "The diaphragm, a muscle, does most of the work of breathing."],
        related: ["asthma", "pneumonia", "tuberculosis", "covid-19"],
    },
    digestive: {
        label: "Digestive",
        summary: "The digestive tract breaks food down and absorbs nutrients, from the oesophagus through the stomach and intestines. The liver, gallbladder and pancreas add bile and enzymes that help digestion.",
        keyFacts: ["Most nutrients are absorbed in the small intestine.", "The liver also clears toxins and stores energy."],
        related: ["hepatitis-b", "typhoid", "cholera", "diarrhea"],
    },
    urinary: {
        label: "Urinary",
        summary: "The kidneys filter the blood to remove waste and extra water as urine, which flows down the ureters to the bladder. The kidneys also help control blood pressure and the body's salt and acid balance.",
        keyFacts: ["Each kidney holds about a million tiny filters called nephrons."],
        related: ["chronic-kidney-disease", "diabetes", "hypertension"],
    },
    glands: {
        label: "Glands and immune organs",
        summary: "Glands such as the pituitary and adrenal glands release hormones that act as chemical messengers. The spleen and thymus are part of the immune system: the spleen filters blood and the thymus trains T cells.",
        keyFacts: ["The pituitary is often called the master gland because it controls other glands."],
        related: [],
    },
    integumentary: {
        label: "Skin",
        summary: "The skin is the body's largest organ. It protects against injury and infection, helps control temperature and holds the receptors for touch, pain and heat.",
        keyFacts: ["Hidden by default; switch it on to see the body's outline."],
        related: ["leprosy"],
    },
};

export interface StructureInfo {
    match: RegExp;
    title: string;
    text: string;
    related: string[];
}

export const STRUCTURE_INFO: StructureInfo[] = [
    // Respiratory
    { match: /^right lung$/i, title: "Right lung", text: "The right lung has three lobes (upper, middle and lower) and is slightly larger than the left. Its tiny air sacs, the alveoli, pass oxygen into the blood.", related: ["pneumonia", "tuberculosis", "asthma", "covid-19"] },
    { match: /^left lung$/i, title: "Left lung", text: "The left lung has two lobes and a notch, the cardiac notch, that makes room for the heart. Like the right lung, it exchanges oxygen and carbon dioxide in millions of alveoli.", related: ["pneumonia", "tuberculosis", "asthma", "covid-19"] },
    { match: /trachea/i, title: "Trachea (windpipe)", text: "The trachea carries air from the throat to the chest, where it divides into the left and right main bronchi. C-shaped rings of cartilage keep it open.", related: [] },
    { match: /bronch/i, title: "Bronchial tree", text: "The bronchi branch again and again into smaller airways that reach every part of the lung. In asthma their walls swell and tighten, narrowing the airway.", related: ["asthma"] },
    { match: /epiglottis/i, title: "Epiglottis", text: "A flap of cartilage that folds over the entrance to the larynx when you swallow, so food goes into the oesophagus rather than the airway.", related: [] },
    { match: /diaphragm/i, title: "Diaphragm", text: "A dome-shaped muscle under the lungs. When it contracts it flattens, the chest expands and air is drawn in.", related: [] },

    // Liver segments first: "Hepatovenous" would otherwise match the generic vein pattern.
    { match: /hepatovenous segment|caudate lobe of liver/i, title: "Liver", text: "The liver is the largest internal organ. Surgeons divide it into segments by its blood supply. It makes bile, stores energy, makes proteins and clears toxins from the blood.", related: ["hepatitis-b"] },

    // Heart
    { match: /mitral|tricuspid|valve|cusp|leaflet/i, title: "Heart valve", text: "The heart has four one-way valves (tricuspid, pulmonary, mitral and aortic) that keep blood flowing forward. Their closing makes the sound of the heartbeat.", related: ["heart-failure"] },
    { match: /papillary muscle/i, title: "Papillary muscle", text: "Small muscles inside the ventricles that tether the mitral and tricuspid valves by cords, stopping the valves flipping backwards when the heart contracts.", related: [] },
    { match: /atrium/i, title: "Atrium", text: "The two upper chambers of the heart. The right atrium receives oxygen-poor blood from the body; the left atrium receives oxygen-rich blood from the lungs.", related: ["heart-failure"] },
    { match: /ventricle/i, title: "Ventricle", text: "The two lower, pumping chambers of the heart. The right ventricle sends blood to the lungs; the thicker left ventricle pumps it around the whole body.", related: ["heart-failure", "myocardial-infarction", "hypertension"] },
    { match: /coronary|cardiac vein|conus artery|diagonal branch/i, title: "Coronary vessels", text: "The coronary arteries supply the heart muscle itself with blood, and the cardiac veins drain it. A blocked coronary artery causes a heart attack.", related: ["heart-disease", "myocardial-infarction"] },
    { match: /aorta|aortic arch/i, title: "Aorta", text: "The body's largest artery. It leaves the left ventricle, arches over the heart and runs down through the chest and abdomen, branching to supply the organs.", related: ["hypertension"] },
    { match: /vena cava/i, title: "Vena cava", text: "The superior and inferior venae cavae are the large veins that return oxygen-poor blood from the body to the right atrium.", related: [] },
    { match: /hepatic|portal vein/i, title: "Liver vessels and ducts", text: "The liver receives blood from both the hepatic artery and the portal vein, which brings nutrient-rich blood from the gut. Hepatic veins drain it, and bile ducts carry bile out.", related: ["hepatitis-b"] },
    { match: /renal/i, title: "Renal vessels", text: "The renal arteries and veins carry about a fifth of the heart's output through the kidneys so the blood can be filtered.", related: ["chronic-kidney-disease"] },
    { match: /pulmonary|segmental (artery|vein)|lingular (artery|vein)/i, title: "Pulmonary vessels", text: "Pulmonary arteries carry oxygen-poor blood from the right ventricle into the lungs; pulmonary veins return oxygen-rich blood to the left atrium.", related: [] },
    { match: /cerebral artery|basilar|vertebral artery|communicating artery|cerebellar artery/i, title: "Brain arteries", text: "These arteries supply the brain, which needs a constant flow of oxygen. A blockage or bleed in one of them causes a stroke.", related: ["stroke"] },
    { match: /carotid/i, title: "Carotid artery", text: "The carotid arteries run up each side of the neck and supply the head and brain. Narrowing of a carotid artery is a cause of stroke.", related: ["stroke"] },
    { match: /jugular/i, title: "Jugular vein", text: "The jugular veins drain blood from the head and neck back towards the heart.", related: [] },
    { match: /femoral|iliac|popliteal|tibial (artery|vein)|saphenous|peroneal|fibular (artery|vein)|plantar|dorsalis pedis/i, title: "Leg vessels", text: "Arteries such as the iliac and femoral arteries carry blood to the legs; deep and surface veins, including the long saphenous vein, return it.", related: [] },
    { match: /subclavian|axillary|brachial|radial (artery|vein)|ulnar (artery|vein)|cephalic|basilic|palmar/i, title: "Arm vessels", text: "The subclavian, axillary and brachial arteries carry blood to the arm; the brachial artery is where blood pressure is usually measured.", related: ["hypertension"] },
    { match: /arter/i, title: "Artery", text: "Arteries carry blood away from the heart under pressure. Their muscular, elastic walls smooth out each heartbeat into steady flow.", related: ["hypertension"] },
    { match: /vein|venous/i, title: "Vein", text: "Veins carry blood back to the heart. Many contain valves that stop blood flowing backwards, helped by the squeeze of surrounding muscles.", related: [] },

    // Digestive
    { match: /gallbladder/i, title: "Gallbladder", text: "A small pouch under the liver that stores and concentrates bile, then squeezes it into the intestine after a fatty meal.", related: [] },
    { match: /bile|biliary|cystic duct|hepatic duct/i, title: "Bile ducts", text: "Bile ducts carry bile from the liver and gallbladder to the duodenum, where it helps digest fats.", related: [] },
    { match: /pancrea/i, title: "Pancreas", text: "The pancreas makes digestive enzymes and the hormones insulin and glucagon, which control blood sugar.", related: ["diabetes"] },
    { match: /^stomach$/i, title: "Stomach", text: "A muscular bag that mixes food with acid and enzymes to start breaking down proteins. It sits mostly on the left side, under the ribs.", related: [] },
    { match: /esophagus/i, title: "Oesophagus", text: "The muscular tube that carries food from the throat to the stomach in waves of contraction called peristalsis.", related: [] },
    { match: /duodenum|jejunum|ileum$|part of ileum/i, title: "Small intestine", text: "About 6 metres long, the small intestine (duodenum, jejunum and ileum) is where most nutrients are absorbed through millions of finger-like villi.", related: ["cholera", "diarrhea", "typhoid"] },
    { match: /colon|cecum|rectum|appendix|ileocecal/i, title: "Large intestine", text: "The large intestine absorbs water and salts and forms stool. The appendix is a small pouch off its first part, the caecum.", related: ["diarrhea"] },
    { match: /sublingual|submandibular|parotid/i, title: "Salivary gland", text: "Salivary glands make saliva, which moistens food and begins digesting starch.", related: [] },

    // Urinary
    { match: /kidney/i, title: "Kidney", text: "Each kidney filters the blood through about a million nephrons, removing waste and extra water as urine. The kidneys also help control blood pressure and make a hormone that drives red blood cell production.", related: ["chronic-kidney-disease", "diabetes", "hypertension"] },
    { match: /ureter/i, title: "Ureter", text: "A narrow muscular tube that carries urine from each kidney down to the bladder.", related: [] },
    { match: /urinary bladder/i, title: "Urinary bladder", text: "A stretchy muscular bag in the pelvis that stores urine until it is emptied.", related: [] },

    // Glands and immune organs
    { match: /spleen/i, title: "Spleen", text: "The spleen filters the blood, removes old red blood cells and helps fight infection. It can enlarge in infections such as malaria.", related: ["malaria"] },
    { match: /thymus/i, title: "Thymus", text: "A gland behind the breastbone where T cells, a type of white blood cell, mature. It is largest in childhood and shrinks after puberty.", related: [] },
    { match: /pituitary/i, title: "Pituitary gland", text: "A pea-sized gland under the brain that releases hormones controlling growth, the thyroid, the adrenal glands and reproduction.", related: [] },
    { match: /adrenal|suprarenal/i, title: "Adrenal gland", text: "Small glands on top of each kidney that make cortisol and adrenaline, hormones involved in stress, blood pressure and metabolism.", related: [] },

    // Nervous
    { match: /hippocampus/i, title: "Hippocampus", text: "A curved structure deep in the temporal lobe that is essential for forming new memories.", related: [] },
    { match: /hypothalamus|tuber cinereum|thalamus/i, title: "Thalamus and hypothalamus", text: "The thalamus relays sensory signals to the cortex. The hypothalamus below it controls body temperature, hunger, thirst and the pituitary gland.", related: [] },
    { match: /cingulate/i, title: "Cingulate gyrus", text: "Part of the brain's limbic system, involved in emotion, motivation and attention.", related: ["depression"] },
    { match: /insula/i, title: "Insula", text: "A fold of cortex hidden deep inside the side of the brain, involved in taste, body awareness and emotion.", related: [] },
    { match: /frontal gyrus|precentral|orbital gyr|frontal pole/i, title: "Frontal lobe", text: "The frontal lobe handles planning, decision-making, personality and speech. Its precentral gyrus, the motor strip, controls movement of the opposite side of the body.", related: ["stroke", "depression"] },
    { match: /postcentral|parietal|angular gyrus|supramarginal|precuneus/i, title: "Parietal lobe", text: "The parietal lobe processes touch, temperature and pain and helps us judge space and the position of the body.", related: ["stroke"] },
    { match: /temporal gyrus|fusiform|parahippocampal|temporal pole/i, title: "Temporal lobe", text: "The temporal lobe handles hearing, memory and understanding language.", related: ["stroke"] },
    { match: /occipital lobe|cuneus|lingual gyrus|calcarine/i, title: "Occipital lobe", text: "The occipital lobe at the back of the brain is the main centre for vision.", related: ["stroke"] },
    { match: /cerebellum/i, title: "Cerebellum", text: "The cerebellum coordinates balance, posture and smooth, accurate movement.", related: [] },
    { match: /midbrain|pons|medulla oblongata|colliculus|peduncle/i, title: "Brainstem", text: "The brainstem links the brain to the spinal cord and controls automatic functions such as breathing, heart rate and swallowing.", related: [] },
    { match: /white matter|internal capsule|corpus callosum|fornix|commissure/i, title: "White matter", text: "White matter is made of nerve fibres that connect different brain regions; the corpus callosum links the two hemispheres.", related: ["stroke"] },
    { match: /spinal cord/i, title: "Spinal cord", text: "The spinal cord runs inside the vertebral column and carries signals between the brain and the body. It also handles simple reflexes on its own.", related: [] },
    { match: /nerve|plexus|ganglion/i, title: "Nerve", text: "Nerves are bundles of fibres that carry signals for movement and sensation between the central nervous system and the body.", related: ["leprosy", "rabies"] },

    // Skeletal
    { match: /frontal bone|parietal bone|occipital bone|temporal bone|sphenoid|ethmoid|nasal bone|zygomatic|maxilla|vomer|palatine|lacrimal bone/i, title: "Skull", text: "The skull is made of more than 20 bones. Those around the brain fuse together at joints called sutures, and the facial bones shape the face and hold the teeth.", related: [] },
    { match: /mandible/i, title: "Mandible (lower jaw)", text: "The only movable bone of the skull. It holds the lower teeth and works with the chewing muscles.", related: [] },
    { match: /tooth|incisor|canine|premolar|molar/i, title: "Tooth", text: "Adults normally have 32 teeth. Enamel, the hardest substance in the body, covers the crown of each tooth.", related: ["fluorosis"] },
    { match: /intervertebral dis/i, title: "Intervertebral disc", text: "Cushions of tough cartilage between the vertebrae that absorb shock and let the spine bend.", related: [] },
    { match: /vertebra|atlas|axis/i, title: "Vertebra", text: "The spine has 7 neck (cervical), 12 chest (thoracic) and 5 lower-back (lumbar) vertebrae above the sacrum. Together they protect the spinal cord and carry the body's weight.", related: ["osteoporosis", "bone-tb"] },
    { match: /sacrum|coccyx/i, title: "Sacrum and coccyx", text: "The sacrum is formed from five fused vertebrae and joins the spine to the pelvis; the coccyx (tailbone) sits below it.", related: [] },
    { match: /rib|costal cartilage/i, title: "Rib", text: "Twelve pairs of ribs form the rib cage, which protects the heart and lungs and moves with each breath.", related: [] },
    { match: /sternum|xiphoid|manubrium/i, title: "Sternum (breastbone)", text: "The flat bone at the front of the chest. The ribs join it through costal cartilage.", related: [] },
    { match: /clavicle/i, title: "Clavicle (collarbone)", text: "The clavicle braces the shoulder away from the chest and is one of the most commonly broken bones.", related: [] },
    { match: /scapula/i, title: "Scapula (shoulder blade)", text: "A flat, triangular bone on the upper back that forms the socket of the shoulder joint.", related: [] },
    { match: /humerus/i, title: "Humerus", text: "The bone of the upper arm, running from the shoulder to the elbow.", related: ["osteoporosis"] },
    { match: /radius|ulna/i, title: "Radius and ulna", text: "The two forearm bones. The radius rotates around the ulna to turn the palm up and down; a wrist fracture usually involves the radius.", related: ["osteoporosis"] },
    { match: /carpal|metacarpal|phalanx of (left |right )?(index|middle|ring|little)? ?finger|phalanx of thumb|scaphoid|lunate|trapezium|trapezoid|capitate|hamate|pisiform|triquetral/i, title: "Hand bones", text: "Each hand has 27 bones: 8 wrist (carpal) bones, 5 metacarpals and 14 finger bones (phalanges).", related: ["osteoarthritis"] },
    { match: /hip bone|ilium|ischium|pubis/i, title: "Hip bone", text: "Each hip bone is formed from three fused bones (ilium, ischium and pubis). Together with the sacrum they make the pelvis, which supports the upper body.", related: ["osteoporosis", "osteoarthritis"] },
    { match: /femur/i, title: "Femur (thigh bone)", text: "The longest and strongest bone in the body. Its upper end forms the hip joint, and a hip fracture in older adults is often linked to osteoporosis.", related: ["osteoporosis", "osteoarthritis"] },
    { match: /patella/i, title: "Patella (kneecap)", text: "A small bone in the tendon at the front of the knee that protects the joint and helps the thigh muscles straighten the leg.", related: ["osteoarthritis"] },
    { match: /tibia|fibula/i, title: "Tibia and fibula", text: "The two bones of the lower leg. The tibia (shin bone) carries most of the weight; the thinner fibula supports the ankle.", related: [] },
    { match: /tarsal|talus|calcaneus|navicular|cuboid|cuneiform|phalanx of .*toe/i, title: "Foot bones", text: "Each foot has 26 bones arranged in arches that spread the body's weight and act as a spring when walking.", related: [] },
    { match: /cartilage/i, title: "Cartilage", text: "Firm, flexible tissue that shapes structures such as the larynx and nose and covers the ends of bones in joints.", related: [] },

    // Muscular
    { match: /biceps brachii/i, title: "Biceps brachii", text: "The muscle at the front of the upper arm that bends the elbow and turns the palm upwards.", related: [] },
    { match: /triceps/i, title: "Triceps", text: "The muscle at the back of the upper arm that straightens the elbow.", related: [] },
    { match: /deltoid/i, title: "Deltoid", text: "The rounded muscle over the shoulder that lifts the arm away from the body.", related: [] },
    { match: /pectoralis major/i, title: "Pectoralis major", text: "The large chest muscle that pulls the arm across the body and forward.", related: [] },
    { match: /rectus abdominis/i, title: "Rectus abdominis", text: "The 'six-pack' muscle down the front of the abdomen. It bends the trunk forward and supports the organs.", related: [] },
    { match: /external oblique|internal oblique|transversus abdominis/i, title: "Abdominal wall muscles", text: "Layers of muscle that wrap the abdomen, twist and bend the trunk and help with breathing out and coughing.", related: [] },
    { match: /latissimus/i, title: "Latissimus dorsi", text: "A broad back muscle that pulls the arm down and back, as in climbing or rowing.", related: [] },
    { match: /trapezius/i, title: "Trapezius", text: "A large, diamond-shaped muscle of the upper back and neck that moves and steadies the shoulder blades.", related: [] },
    { match: /gluteus/i, title: "Gluteal muscles", text: "The buttock muscles. Gluteus maximus straightens the hip when climbing or rising; gluteus medius keeps the pelvis level when walking.", related: [] },
    { match: /rectus femoris|vastus/i, title: "Quadriceps", text: "Four muscles at the front of the thigh that straighten the knee.", related: [] },
    { match: /biceps femoris|semitendinosus|semimembranosus/i, title: "Hamstrings", text: "Muscles at the back of the thigh that bend the knee and straighten the hip.", related: [] },
    { match: /gastrocnemius|soleus/i, title: "Calf muscles", text: "The calf muscles join the Achilles tendon and lift the heel when you walk, run or stand on tiptoe.", related: [] },
    { match: /sternocleidomastoid/i, title: "Sternocleidomastoid", text: "A strap-like neck muscle that turns and tilts the head.", related: [] },
    { match: /masseter|temporalis/i, title: "Chewing muscles", text: "The masseter and temporalis close the jaw; the masseter is one of the strongest muscles for its size.", related: [] },
    { match: /intercostal/i, title: "Intercostal muscles", text: "Muscles between the ribs that help move the rib cage when breathing.", related: [] },

    // Skin
    { match: /^skin$/i, title: "Skin", text: "The skin is the body's largest organ. It protects against injury and infection, helps control temperature and holds receptors for touch, pain and heat.", related: ["leprosy"] },
];

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function describePart(name: string, systemId: string): { title: string; text: string; related: string[] } {
    const hit = STRUCTURE_INFO.find((s) => s.match.test(name));
    if (hit) return { title: hit.title, text: hit.text, related: hit.related };
    const sys = SYSTEM_INFO[systemId as SystemId];
    if (!sys) return { title: capitalise(name), text: "Part of the human body model.", related: [] };
    return {
        title: capitalise(name),
        text: `Part of the ${sys.label.toLowerCase()} system. ${sys.summary}`,
        related: sys.related,
    };
}
