"""Labelled phrases for the assistant's small intent model. HOLD_OUT is never used for training."""

TRAIN = {
    "greeting": ["hi", "hello", "hey", "hii", "helloo", "hey there", "hi there", "hello there", "good morning", "good evening", "good afternoon", "namaste", "yo", "greetings", "hola", "hi assistant", "hello lab", "hey lab assistant", "morning", "sup"],
    "thanks": ["thanks", "thank you", "thx", "thanks a lot", "thank you so much", "great thanks", "cheers", "much appreciated", "ty", "awesome thank you", "many thanks", "thanks for that", "nice thanks"],
    "goodbye": ["bye", "goodbye", "see you", "see ya", "good night", "later", "catch you later", "bye bye", "take care", "that is all for now", "ok bye", "i am done thanks bye"],
    "identity": ["who are you", "what are you", "what is your name", "are you a bot", "are you an ai", "are you human", "are you a doctor", "tell me about yourself", "introduce yourself", "what is this assistant", "are you chatgpt", "what model are you"],
    "help": ["help", "what can you do", "what do you do", "how can you help", "what can i ask", "show options", "menu", "what are your features", "how do i use this", "how does this page work", "where do i start", "give me some examples", "what questions can i ask", "what can this lab do", "getting started", "i am lost"],
    "lab_status": ["whats the progress", "what is the progress", "any progress", "progress so far", "project status", "what is the status", "status update", "how far along is the lab", "is the lab ready", "has calibration finished", "is calibration done", "has validation run", "is it finished", "what is left to do", "are the results ready", "where do things stand", "update on the lab", "is the model calibrated", "status please", "current status of the lab"],
    "how_it_works": ["how does it work", "how does the lab work", "how does the simulator work", "explain the simulation", "what is a virtual trial", "what is an in silico trial", "how are virtual patients made", "where do the patients come from", "what data do you use", "explain the model", "what is nhanes", "how is this built", "what is calibration", "what does held out mean", "what is a digital twin", "why simulate trials", "what is this lab", "what is medbase"],
    "smalltalk": ["how are you", "how is it going", "whats up", "how are you doing", "nice to meet you", "you are cool", "that is great", "ok", "okay", "cool", "good job", "nice", "wow", "lol", "hmm"],
    "research": ["compare semaglutide and empagliflozin", "run a trial of sitagliptin", "simulate metformin over 30 weeks", "power for sitagliptin 100 mg", "who responds to empagliflozin", "design a study of semaglutide", "show validation results", "how accurate is the model", "side effects of semaglutide", "how does diabetes progress", "what are the assumptions", "effect of empagliflozin in kidney disease", "how many patients are needed for metformin", "run semaglutide 1 mg against placebo", "lowest dose of empagliflozin in a study", "what parameters does the model use", "can diabetes reverse in the model", "does metformin work in the simulation", "test a hypothetical drug", "compare two drugs", "how far can i trust this lab", "can i trust these results", "how reliable is this", "how good are the predictions"],
}

HOLD_OUT = {
    "greeting": ["hiya", "hello!", "hey hey", "good day", "hi lab", "hello assistant"],
    "thanks": ["thank u", "thanks so much", "appreciate it", "thanks!"],
    "goodbye": ["bye for now", "see you later", "goodnight", "ok goodbye"],
    "identity": ["who r u", "are you a real doctor", "are you a robot", "what's your name"],
    "help": ["what can u do", "how can i use this", "any examples", "what should i ask here"],
    "lab_status": ["what's the progress", "whats the status", "is everything ready", "did calibration finish", "update please", "how is the project going"],
    "how_it_works": ["how do virtual patients work", "how does this simulator work", "what is held out validation", "what data is this based on", "explain how the lab works"],
    "smalltalk": ["how are u", "ok cool", "great", "how's it going"],
    "research": ["compare metformin and sitagliptin", "simulate semaglutide over 40 weeks", "who benefits from sitagliptin", "power for empagliflozin 25 mg", "side effects of metformin", "how accurate is this lab"],
}
