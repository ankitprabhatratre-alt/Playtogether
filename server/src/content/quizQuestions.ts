/**
 * Quiz Battle question bank. First answer in `a` is the correct one;
 * choices are shuffled server-side per question. Time-sensitive facts
 * (records, current champions) are deliberately avoided.
 */
export interface QuizQuestion {
  c: 'general' | 'science' | 'technology' | 'movies' | 'sports' | 'geography';
  d: 'easy' | 'medium' | 'hard';
  q: string;
  a: [string, string, string, string];
}

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  // ---------------- General knowledge ----------------
  { c: 'general', d: 'easy', q: 'How many days are in a leap year?', a: ['366', '365', '364', '367'] },
  { c: 'general', d: 'easy', q: 'What colour do you get by mixing blue and yellow?', a: ['Green', 'Purple', 'Orange', 'Brown'] },
  { c: 'general', d: 'easy', q: 'How many continents are there on Earth?', a: ['7', '5', '6', '8'] },
  { c: 'general', d: 'easy', q: 'How many sides does a hexagon have?', a: ['6', '5', '7', '8'] },
  { c: 'general', d: 'easy', q: 'Which animal is often called the "King of the Jungle"?', a: ['Lion', 'Tiger', 'Elephant', 'Gorilla'] },
  { c: 'general', d: 'medium', q: 'Who painted the Mona Lisa?', a: ['Leonardo da Vinci', 'Michelangelo', 'Raphael', 'Vincent van Gogh'] },
  { c: 'general', d: 'medium', q: 'In which year did World War II end?', a: ['1945', '1939', '1944', '1950'] },
  { c: 'general', d: 'medium', q: 'What is the hardest natural substance?', a: ['Diamond', 'Gold', 'Iron', 'Quartz'] },
  { c: 'general', d: 'medium', q: 'How many pieces does each player start with in chess?', a: ['16', '12', '14', '18'] },
  { c: 'general', d: 'medium', q: 'In Greek mythology, who is the god of the sea?', a: ['Poseidon', 'Zeus', 'Hades', 'Apollo'] },
  { c: 'general', d: 'medium', q: 'What is the currency of Japan?', a: ['Yen', 'Won', 'Yuan', 'Ringgit'] },
  { c: 'general', d: 'medium', q: 'What is the smallest prime number?', a: ['2', '1', '3', '0'] },
  { c: 'general', d: 'hard', q: 'Which letter does not appear in the name of any U.S. state?', a: ['Q', 'Z', 'X', 'J'] },
  { c: 'general', d: 'hard', q: 'The Rosetta Stone was key to deciphering which writing system?', a: ['Egyptian hieroglyphs', 'Cuneiform', 'Linear B', 'Mayan glyphs'] },
  { c: 'general', d: 'hard', q: 'Which Ancient Wonder stood in the harbour of Alexandria?', a: ['The Lighthouse (Pharos)', 'The Hanging Gardens', 'The Colossus', 'The Temple of Artemis'] },
  { c: 'general', d: 'hard', q: 'How many keys does a standard modern piano have?', a: ['88', '76', '92', '64'] },

  // ---------------- Science ----------------
  { c: 'science', d: 'easy', q: 'Which planet is known as the Red Planet?', a: ['Mars', 'Venus', 'Jupiter', 'Mercury'] },
  { c: 'science', d: 'easy', q: 'Which gas do plants absorb from the air for photosynthesis?', a: ['Carbon dioxide', 'Oxygen', 'Nitrogen', 'Hydrogen'] },
  { c: 'science', d: 'easy', q: 'What is the largest planet in our solar system?', a: ['Jupiter', 'Saturn', 'Neptune', 'Earth'] },
  { c: 'science', d: 'easy', q: 'Which organelle is known as the "powerhouse of the cell"?', a: ['Mitochondria', 'Nucleus', 'Ribosome', 'Golgi body'] },
  { c: 'science', d: 'easy', q: 'At sea level, water boils at what temperature in Celsius?', a: ['100°C', '90°C', '80°C', '120°C'] },
  { c: 'science', d: 'medium', q: 'How many bones are in the adult human body?', a: ['206', '186', '226', '256'] },
  { c: 'science', d: 'medium', q: 'What is the chemical symbol for gold?', a: ['Au', 'Ag', 'Gd', 'Go'] },
  { c: 'science', d: 'medium', q: 'Which element has atomic number 1?', a: ['Hydrogen', 'Helium', 'Oxygen', 'Carbon'] },
  { c: 'science', d: 'medium', q: 'What is the most abundant gas in Earth\'s atmosphere?', a: ['Nitrogen', 'Oxygen', 'Argon', 'Carbon dioxide'] },
  { c: 'science', d: 'medium', q: 'Which planet has the shortest year?', a: ['Mercury', 'Venus', 'Mars', 'Earth'] },
  { c: 'science', d: 'medium', q: 'Approximately how fast does light travel in a vacuum?', a: ['300,000 km/s', '150,000 km/s', '30,000 km/s', '3,000,000 km/s'] },
  { c: 'science', d: 'hard', q: 'What is the SI unit of electrical resistance?', a: ['Ohm', 'Volt', 'Ampere', 'Watt'] },
  { c: 'science', d: 'hard', q: 'Which blood type is known as the universal red-cell donor?', a: ['O negative', 'AB positive', 'A positive', 'B negative'] },
  { c: 'science', d: 'hard', q: 'Which type of chemical bond involves sharing pairs of electrons?', a: ['Covalent', 'Ionic', 'Metallic', 'Hydrogen'] },
  { c: 'science', d: 'hard', q: 'Roughly how old is the Earth?', a: ['4.5 billion years', '450 million years', '10 billion years', '45 billion years'] },
  { c: 'science', d: 'hard', q: 'What is the pH of pure water at 25°C?', a: ['7', '0', '5', '14'] },

  // ---------------- Technology ----------------
  { c: 'technology', d: 'easy', q: 'What does "CPU" stand for?', a: ['Central Processing Unit', 'Computer Personal Unit', 'Central Program Utility', 'Core Processing Utility'] },
  { c: 'technology', d: 'easy', q: 'How many bits are in a byte?', a: ['8', '4', '16', '10'] },
  { c: 'technology', d: 'easy', q: 'Which language is primarily used to style web pages?', a: ['CSS', 'Python', 'SQL', 'C++'] },
  { c: 'technology', d: 'easy', q: 'What does "GPU" stand for?', a: ['Graphics Processing Unit', 'General Purpose Utility', 'Graphical Program Unit', 'Gaming Power Unit'] },
  { c: 'technology', d: 'easy', q: 'Which company makes the iPhone?', a: ['Apple', 'Samsung', 'Google', 'Nokia'] },
  { c: 'technology', d: 'medium', q: 'What does HTML stand for?', a: ['HyperText Markup Language', 'High Transfer Markup Language', 'HyperText Machine Language', 'Home Tool Markup Language'] },
  { c: 'technology', d: 'medium', q: 'What is the decimal number 5 in binary?', a: ['101', '110', '111', '100'] },
  { c: 'technology', d: 'medium', q: 'What does "RAM" stand for?', a: ['Random Access Memory', 'Read Access Memory', 'Rapid Action Memory', 'Run All Memory'] },
  { c: 'technology', d: 'medium', q: 'In which year was the first iPhone released?', a: ['2007', '2005', '2008', '2010'] },
  { c: 'technology', d: 'medium', q: 'Which protocol is used for secure (padlock) web browsing?', a: ['HTTPS', 'FTP', 'SMTP', 'Telnet'] },
  { c: 'technology', d: 'medium', q: 'What does "SQL" stand for?', a: ['Structured Query Language', 'Simple Question Language', 'Sequential Query Logic', 'Standard Quick Lookup'] },
  { c: 'technology', d: 'medium', q: 'Which British mathematician helped break the Enigma code in WWII?', a: ['Alan Turing', 'Charles Babbage', 'Isaac Newton', 'Tim Berners-Lee'] },
  { c: 'technology', d: 'hard', q: 'Which data structure works on a "Last In, First Out" basis?', a: ['Stack', 'Queue', 'Tree', 'Hash table'] },
  { c: 'technology', d: 'hard', q: 'What is the decimal number 255 in hexadecimal?', a: ['FF', 'FE', '100', 'EF'] },
  { c: 'technology', d: 'hard', q: 'Who is credited with inventing the World Wide Web?', a: ['Tim Berners-Lee', 'Vint Cerf', 'Bill Gates', 'Linus Torvalds'] },
  { c: 'technology', d: 'hard', q: 'Which port number is the default for HTTPS?', a: ['443', '80', '21', '8080'] },

  // ---------------- Movies & TV ----------------
  { c: 'movies', d: 'easy', q: 'In "The Lion King", what is the name of Simba\'s father?', a: ['Mufasa', 'Scar', 'Rafiki', 'Timon'] },
  { c: 'movies', d: 'easy', q: 'Which school of witchcraft does Harry Potter attend?', a: ['Hogwarts', 'Durmstrang', 'Beauxbatons', 'Ilvermorny'] },
  { c: 'movies', d: 'easy', q: 'What is the name of the cowboy toy in "Toy Story"?', a: ['Woody', 'Buzz', 'Rex', 'Hamm'] },
  { c: 'movies', d: 'easy', q: 'In "Frozen", what is the name of the snowman?', a: ['Olaf', 'Sven', 'Kristoff', 'Hans'] },
  { c: 'movies', d: 'easy', q: 'What kind of fish is Nemo in "Finding Nemo"?', a: ['Clownfish', 'Blue tang', 'Goldfish', 'Angelfish'] },
  { c: 'movies', d: 'easy', q: 'Which 1997 film follows Jack and Rose aboard a doomed ship?', a: ['Titanic', 'Poseidon', 'Pearl Harbor', 'The Abyss'] },
  { c: 'movies', d: 'medium', q: 'Who directed "Jurassic Park" (1993)?', a: ['Steven Spielberg', 'James Cameron', 'George Lucas', 'Ridley Scott'] },
  { c: 'movies', d: 'medium', q: 'What is the fictional African nation in "Black Panther"?', a: ['Wakanda', 'Zamunda', 'Genovia', 'Sokovia'] },
  { c: 'movies', d: 'medium', q: '"Naatu Naatu" won the Oscar for Best Original Song. Which film is it from?', a: ['RRR', 'Baahubali 2', 'KGF: Chapter 2', 'Pushpa'] },
  { c: 'movies', d: 'medium', q: 'What is the name of the coffee shop in "Friends"?', a: ['Central Perk', 'Java Joe\'s', 'The Grind', 'Monk\'s Café'] },
  { c: 'movies', d: 'medium', q: 'Who composed the scores for "Star Wars", "Jaws" and "Jurassic Park"?', a: ['John Williams', 'Hans Zimmer', 'Ennio Morricone', 'Howard Shore'] },
  { c: 'movies', d: 'medium', q: 'In "The Matrix", which pill does Neo take?', a: ['Red', 'Blue', 'Green', 'Yellow'] },
  { c: 'movies', d: 'hard', q: 'Which film won the first-ever Oscar for Best Animated Feature?', a: ['Shrek', 'Monsters, Inc.', 'Spirited Away', 'Ice Age'] },
  { c: 'movies', d: 'hard', q: 'Which studio made "Spirited Away" and "My Neighbor Totoro"?', a: ['Studio Ghibli', 'Toei Animation', 'Pixar', 'Madhouse'] },
  { c: 'movies', d: 'hard', q: 'Who is the iconic villain of the 1975 Hindi film "Sholay"?', a: ['Gabbar Singh', 'Mogambo', 'Shakaal', 'Kancha Cheena'] },
  { c: 'movies', d: 'hard', q: 'What is the name of the hotel in Stanley Kubrick\'s "The Shining"?', a: ['The Overlook', 'The Stanley', 'The Grand Budapest', 'The Bates Motel'] },

  // ---------------- Sports ----------------
  { c: 'sports', d: 'easy', q: 'How many players does a football (soccer) team have on the field?', a: ['11', '10', '9', '12'] },
  { c: 'sports', d: 'easy', q: 'In cricket, how many legal balls are in a standard over?', a: ['6', '5', '8', '10'] },
  { c: 'sports', d: 'easy', q: 'Which sport uses a shuttlecock?', a: ['Badminton', 'Squash', 'Table tennis', 'Volleyball'] },
  { c: 'sports', d: 'easy', q: 'In tennis, what is a score of zero called?', a: ['Love', 'Nil', 'Duck', 'Blank'] },
  { c: 'sports', d: 'easy', q: 'How many rings are on the Olympic flag?', a: ['5', '4', '6', '7'] },
  { c: 'sports', d: 'medium', q: 'How long is a marathon?', a: ['42.195 km', '40 km', '26 km', '50 km'] },
  { c: 'sports', d: 'medium', q: 'Which cricketer is nicknamed the "Master Blaster"?', a: ['Sachin Tendulkar', 'Virat Kohli', 'MS Dhoni', 'Brian Lara'] },
  { c: 'sports', d: 'medium', q: 'Where were the first modern Olympic Games held in 1896?', a: ['Athens', 'Paris', 'London', 'Rome'] },
  { c: 'sports', d: 'medium', q: 'In golf, what is one stroke under par called?', a: ['Birdie', 'Eagle', 'Bogey', 'Albatross'] },
  { c: 'sports', d: 'medium', q: 'How many players per team are on a volleyball court?', a: ['6', '5', '7', '8'] },
  { c: 'sports', d: 'medium', q: 'Which martial art from Korea is an Olympic sport?', a: ['Taekwondo', 'Judo', 'Karate', 'Kung fu'] },
  { c: 'sports', d: 'medium', q: 'Which city hosted the 2016 Summer Olympics?', a: ['Rio de Janeiro', 'Tokyo', 'London', 'Beijing'] },
  { c: 'sports', d: 'hard', q: 'What is the maximum break in standard snooker?', a: ['147', '155', '140', '180'] },
  { c: 'sports', d: 'hard', q: 'In which sport is the Ryder Cup contested?', a: ['Golf', 'Tennis', 'Sailing', 'Polo'] },
  { c: 'sports', d: 'hard', q: 'The term "hat-trick" is generally credited as originating in which sport?', a: ['Cricket', 'Football', 'Ice hockey', 'Baseball'] },
  { c: 'sports', d: 'hard', q: 'How many players are on the field per side in a field hockey match?', a: ['11', '10', '9', '12'] },

  // ---------------- Geography ----------------
  { c: 'geography', d: 'easy', q: 'What is the capital of France?', a: ['Paris', 'Lyon', 'Marseille', 'Nice'] },
  { c: 'geography', d: 'easy', q: 'Which is the largest ocean on Earth?', a: ['Pacific', 'Atlantic', 'Indian', 'Arctic'] },
  { c: 'geography', d: 'easy', q: 'What is the smallest country in the world by area?', a: ['Vatican City', 'Monaco', 'San Marino', 'Malta'] },
  { c: 'geography', d: 'easy', q: 'Which country is known as the "Land of the Rising Sun"?', a: ['Japan', 'China', 'South Korea', 'Thailand'] },
  { c: 'geography', d: 'easy', q: 'Which is the largest country by area?', a: ['Russia', 'Canada', 'China', 'United States'] },
  { c: 'geography', d: 'medium', q: 'What is the capital of Australia?', a: ['Canberra', 'Sydney', 'Melbourne', 'Perth'] },
  { c: 'geography', d: 'medium', q: 'Mount Everest sits on the border of Nepal and which other country/region?', a: ['China (Tibet)', 'India', 'Bhutan', 'Pakistan'] },
  { c: 'geography', d: 'medium', q: 'What is the capital of Canada?', a: ['Ottawa', 'Toronto', 'Vancouver', 'Montreal'] },
  { c: 'geography', d: 'medium', q: 'What is the capital city of Chhattisgarh?', a: ['Raipur', 'Bilaspur', 'Bhilai', 'Durg'] },
  { c: 'geography', d: 'medium', q: 'What is the largest hot desert in the world?', a: ['Sahara', 'Arabian', 'Kalahari', 'Thar'] },
  { c: 'geography', d: 'medium', q: 'Which river flows through Cairo?', a: ['Nile', 'Tigris', 'Euphrates', 'Congo'] },
  { c: 'geography', d: 'hard', q: 'Which Indian state has the longest coastline?', a: ['Gujarat', 'Tamil Nadu', 'Andhra Pradesh', 'Kerala'] },
  { c: 'geography', d: 'hard', q: 'Lake Baikal, the world\'s deepest lake, is in which country?', a: ['Russia', 'Mongolia', 'Kazakhstan', 'China'] },
  { c: 'geography', d: 'hard', q: 'The Strait of Gibraltar connects the Atlantic Ocean to which sea?', a: ['Mediterranean Sea', 'Red Sea', 'Black Sea', 'Caspian Sea'] },
  { c: 'geography', d: 'hard', q: 'What is the capital of New Zealand?', a: ['Wellington', 'Auckland', 'Christchurch', 'Queenstown'] },
  { c: 'geography', d: 'hard', q: 'How many member states of the United Nations are in Africa?', a: ['54', '48', '50', '57'] },
];
