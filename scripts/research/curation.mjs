// Hand curation applied on top of the screened, machine-verified candidates.
//
// Positions, heights and off-route distances all come from the screening steps
// (OSGB conversion + DEM validation for peaks, OSM for water). This file only
// adds judgement: which candidates are worth a detour, what to say about them,
// and which OSM features are not swimmable at all.
//
// Anything without an entry here still ships as a selectable point using its
// verified name and position — it simply carries no description, rather than a
// fabricated one.

// OSM water features that are not wild swims: engineered basins, private or
// lowland ponds, industrial reservoirs, bog.
export const WATER_EXCLUDE = new Set([
  'Springs Field Attenuation Basin',
  'Natterjack pond',
  'Natterjack fabricated pond',
  'four tarn bog',
  'Borrans Reservoir',
  'Dubbs Reservoir',
  'Throng Moss Reservoir',
  'Greenburn Reservoir',
  'Kentmere Reservoir',
  'Kentmere Tarn',
  'Decoy Pond',
  'Parkgate Tarn',
  "Ruskin's Pond",
  'Holehird Tarn',
  'Middlerigg Tarn',
  'Mortimere',
  'Slew Tarn',
  'Long Moss',
  'Muncaster Tarn',
  'Siney Tarn',
  'Snipeshow Tarn',
  'Springs Field',
  'Banishead Quarry Tarn',
  'Boo Tarn',
  'Latrigg Tarn',
  'Lily Tarn',
  'Whitemoss Tarn',
  'Dockey Tarn',
  'Lang How Tarn',
  'Lingmoor Tarn',
  'High Arnside Tarn',
  'Goosey Foot Tarn',
  'Juniper Tarn',
  'Wharton Tarn',
  'Kelly Hall Tarn',
  'Holehouse Tarn',
  'Low Birker Tarn',
  'Tarn at Leaves',
  'Redcrag Tarn',
  'Hard Tarn',
  'Scandale Tarn',
  'Red Screes Tarn',
  'Foxes Tarn',
  'Lambfoot Dub',
  'High House Tarn',
  'Broadcrag Tarn',
  'Kirkfell Tarn',
  'Beckhead Tarn',
  'Floutern Tarn',
  'Highnook Tarn',
  'Launchy Tarn',
  'Harrop Tarn',
  'Codale Tarn',
  'Beck Leven',
  'Church Beck',
  'Skelwith Pool',
  'Blelham Tarn',
  'Yew Tree Tarn',
]);

// Curated swim notes. `star` marks the ones genuinely worth planning a day
// around. Descriptions describe access and character, not hyperbole.
export const SWIM_NOTES = {
  'Black Moss Pot': {
    star: true,
    labels: ['river pool', 'classic', 'jump'],
    description:
      'A deep rock-walled pool in Langstrath, reached by a flat walk up the valley. Sheer sides give a natural jump of a few metres into water deep enough for it; a sloping slab at the downstream end is the easy way out. One of the best-known wild swims in the Lakes, and the route passes within 20m of it.',
  },
  'Galleny Force': {
    star: true,
    labels: ['river pool', 'classic', 'waterfall'],
    description:
      'Known locally as the Fairy Glen — a chain of clear pools and small falls on Greenup Gill above Stonethwaite. Shallower and gentler than Black Moss Pot, with slabs to sit on. Directly on the route.',
  },
  'Emerald Pools': {
    star: true,
    labels: ['river pool', 'gorge'],
    description:
      'Green-tinted pools in the bed of Lingmell Beck below Wasdale Head, where the water has cut into clean rock. Cold and clear; easy entry from the shingle.',
  },
  'Tray Dub': {
    labels: ['river pool'],
    description: 'A quiet plunge pool on Langstrath Beck, a few metres off the path.',
  },
  'Swan Dub': {
    labels: ['river pool'],
    description: 'Small deep pool on Langstrath Beck, immediately beside the route.',
  },
  'Sprinkling Tarn': {
    star: true,
    labels: ['high tarn', 'wild'],
    description:
      'At 602m below Great End, one of the highest sizeable tarns in the district and a superb place to swim on a clear evening. Exposed — there is no shelter if the weather turns.',
  },
  'Styhead Tarn': {
    labels: ['high tarn'],
    description:
      'Beneath Great Gable at 440m, right on the pass. Popular by day, quiet at either end of it. Mountain rescue stretcher box nearby.',
  },
  'Angle Tarn': {
    star: true,
    labels: ['high tarn', 'wild'],
    description:
      'Sitting at 557m under Bowfell and Rossett Pike, dark and deep with a boulder shore. Reached directly by the route over Rossett Gill.',
  },
  'Burnmoor Tarn': {
    labels: ['tarn', 'remote'],
    description:
      'A wide shallow tarn on the moor between Eskdale and Wasdale at 254m. Peaty and comparatively mild; the surrounding ground is boggy, so use the firmer northern shore.',
  },
  'Innominate Tarn': {
    star: true,
    labels: ['high tarn', 'wild', 'heritage'],
    description:
      "The tarn on Haystacks where Wainwright's ashes were scattered, at 528m. Small, peat-bedded and ringed by rock — the view down Ennerdale is the reason to stop.",
  },
  'Blackbeck Tarn': {
    labels: ['high tarn', 'wild'],
    description: 'Just east of Innominate Tarn at 487m, a little larger and usually deserted.',
  },
  Buttermere: {
    star: true,
    labels: ['lake', 'no powerboats'],
    description:
      'No motorised craft, ringed by Haystacks, Fleetwith Pike and High Stile. Easy grassy entry from the shore path near the Gatesgarth end. One of the finest lake swims on the route.',
  },
  'Crummock Water': {
    labels: ['lake', 'no powerboats'],
    description:
      'Larger and deeper than neighbouring Buttermere, with no powerboats. Scale Force, the highest fall in the Lakes, comes down into its western side.',
  },
  'Blea Water': {
    star: true,
    labels: ['high tarn', 'wild', 'deepest'],
    description:
      'The deepest tarn in England at around 63m, held in a textbook glacial corrie under High Street at 486m. Very cold, very clear, with a boulder shore and no easy shallows.',
  },
  'Small Water': {
    labels: ['high tarn', 'wild'],
    description:
      'Below Nan Bield Pass at 455m, with stone shelters on its shore. Smaller and shallower than Blea Water just over the ridge.',
  },
  Hayeswater: {
    labels: ['tarn'],
    description: 'A former reservoir at 428m under Gray Crag, now returned to a natural tarn.',
  },
  "Lanty's Tarn": {
    labels: ['tarn', 'sheltered'],
    description:
      'A small wooded tarn above Glenridding at 285m, dammed to supply ice to the estate. Sheltered and easy to reach — a good option in poor weather.',
  },
  'Red Tarn': {
    labels: ['high tarn', 'wild'],
    description:
      "In Helvellyn's eastern corrie at 717m between Striding and Swirral Edges. Snow lingers here into spring; expect it to be bitter.",
  },
  'Levers Water': {
    labels: ['high tarn', 'wild'],
    description:
      'A dammed tarn at 413m in the Coppermines valley above Coniston, surrounded by mine workings. Deep, clear and cold.',
  },
  'Goats Water': {
    labels: ['high tarn', 'wild'],
    description:
      'Squeezed between Dow Crag and Coniston Old Man at 505m, with a boulder shore beneath the crag. Sunless for much of the day.',
  },
  'Blind Tarn': {
    labels: ['high tarn', 'wild'],
    description:
      'A true corrie tarn at 565m on Dow Crag with no inlet or outlet stream — it is fed entirely by the fell around it.',
  },
  'Low Water': {
    labels: ['high tarn', 'wild'],
    description: 'A shelf tarn at 546m directly below the summit of Coniston Old Man.',
  },
  'Little Langdale Tarn': {
    labels: ['tarn'],
    description: 'A quiet valley tarn at 104m with a reedy shore; much less visited than Elter Water.',
  },
  'Elter Water': {
    labels: ['lake', 'reedy'],
    description:
      'Shallow and reed-fringed at 56m, with the Langdale Pikes filling the view. Warmest water on the route by some margin.',
  },
  'Rydal Water': {
    labels: ['lake', 'sheltered'],
    description:
      'Small, shallow and sheltered at 57m, with easy shore access and a rock island to swim out to.',
  },
  Grasmere: {
    labels: ['lake'],
    description: 'Gentle shelving shore at 64m; busy in the day, calm early and late.',
  },
  'Easedale Tarn': {
    labels: ['tarn'],
    description:
      'A 45-minute climb from Grasmere past Sour Milk Gill to 283m. Cold and clear, in a broad bowl under Tarn Crag.',
  },
  'Stickle Tarn': {
    star: true,
    labels: ['high tarn', 'dramatic'],
    description:
      'Dammed at 475m directly beneath the face of Pavey Ark, reached by a steep 40 minutes up Stickle Ghyll. The crag rising straight from the far shore is the draw.',
  },
  'Three Tarns': {
    labels: ['high tarn', 'wild'],
    description:
      'A cluster of small pools on the col at 724m between Bowfell and Crinkle Crags — more a place to dip than to swim, and utterly exposed.',
  },
  'Devoke Water': {
    labels: ['tarn', 'remote'],
    description:
      'The largest tarn in the district at 234m, alone on Birker Fell with no fells immediately around it. Big skies, no shelter, rarely anyone there.',
  },
  'Gill Force': {
    star: true,
    labels: ['river pool', 'gorge', 'classic'],
    description:
      'Where the Esk narrows into a rock gorge below Doctor Bridge, with a deep green pool and slabs above it. Directly on the route in lower Eskdale.',
  },
  'Stanley Force': {
    labels: ['waterfall', 'gorge'],
    description:
      'A 20m fall in a wooded ravine off Eskdale, with a pool at its foot. The gorge path is slippery — care on the approach.',
  },
  'Esk Falls': {
    star: true,
    labels: ['river pool', 'gorge', 'classic'],
    description:
      'The upper Esk gorge below Lingcove Bridge, a sequence of deep emerald pools cut into bare rock with falls between them — the Tongue Pot area. Pebble entry, jumps possible, and arguably the finest river swimming in England. Worth timing the day around.',
  },
  'Lingcove Beck Falls': {
    labels: ['river pool', 'gorge'],
    description:
      'Pools on Lingcove Beck just above its junction with the Esk, beside the old packhorse bridge.',
  },
  'Scale Force': {
    labels: ['waterfall'],
    description:
      'The highest single drop in the Lake District at around 52m, in a mossy cleft above Crummock Water. The plunge pool is small and shaded.',
  },
  'Ritson Force': {
    labels: ['waterfall'],
    description: 'A short fall in woodland behind the Wasdale Head Inn, with a small pool beneath.',
  },
  'Taylorgill Force': {
    labels: ['waterfall'],
    description: 'A 40m fall on Styhead Gill above Seathwaite, seen from the Styhead path.',
  },
  'Aira Force': {
    labels: ['waterfall', 'busy'],
    description:
      'A 20m fall in a landscaped glen above Ullswater, crossed by two stone bridges. Popular and well made — not a swim, but a good stop.',
  },
  'Moss Force': {
    labels: ['waterfall'],
    description: 'A stepped fall beside the Newlands Hause road, visible from the top of the pass.',
  },
  'Colwith Force': {
    labels: ['waterfall'],
    description: 'A 15m fall in woodland on the River Brathay between Little and Great Langdale.',
  },
  'Skelwith Force': {
    labels: ['waterfall'],
    description: 'A short but powerful fall on the Brathay near Elterwater, with a viewing platform.',
  },
  'Stock Ghyll Force Waterfall': {
    labels: ['waterfall'],
    description: 'A 21m fall in woodland immediately above Ambleside.',
  },
  'Dungeon Ghyll Force': {
    labels: ['waterfall'],
    description: 'A fall in a narrow cleft above Great Langdale, behind the old hotel.',
  },
  'Sourmilk Gill Falls': {
    labels: ['waterfall'],
    description: 'The cascade below Easedale Tarn, white against the fellside after rain.',
  },
  'Dalehead Tarn': {
    labels: ['high tarn', 'wild'],
    description: 'A small tarn on the col at 504m below Dale Head, a common wild camp stop.',
  },
  'Bleaberry Tarn': {
    labels: ['high tarn', 'wild'],
    description: 'In the corrie between Red Pike and High Stile at 493m, above Buttermere.',
  },
  'Watendlath Tarn': {
    labels: ['tarn', 'hamlet'],
    description: 'A tarn at 259m beside the hamlet of Watendlath, reached by a packhorse track.',
  },
  'Dock Tarn': {
    labels: ['tarn', 'wild'],
    description: 'A shallow tarn at 411m on the shelf above Stonethwaite, ringed by heather.',
  },
  'Eel Tarn': {
    labels: ['tarn', 'remote'],
    description: 'A boggy little tarn on the moor above Boot at 210m; peaty and mild.',
  },
  'Blea Tarn': {
    labels: ['tarn', 'remote'],
    description: 'A small tarn on the Eskdale moor at 220m, quiet and rarely visited.',
  },
  'Stony Tarn': {
    labels: ['tarn', 'remote'],
    description: 'Rocky-shored tarn at 306m on the Eskdale moor, harder to reach than nearby Eel Tarn.',
  },
  'Wast Water': {
    labels: ['lake', 'no powerboats', 'deepest lake'],
    description:
      "England's deepest lake at 79m, with no motorised craft and the screes plunging straight into it. Long shingle shore for easy entry; cold at any time of year.",
  },
  Loweswater: {
    labels: ['lake', 'quiet'],
    description: 'The quietest of the western lakes at 121m, with no powerboats and a wooded shore.',
  },
  'Derwent Water': {
    labels: ['lake', 'islands'],
    description: 'Broad and shallow at 75m with wooded islands; busy with launches near Keswick.',
  },
  Ullswater: {
    labels: ['lake', 'boat traffic'],
    description:
      'The second largest lake, with steamer traffic — swim only in sheltered bays such as Glencoyne, and wear a bright cap.',
  },
  'Brothers Water': {
    labels: ['tarn'],
    description: 'A small shallow water at 161m in Patterdale, with a reedy margin.',
  },
  'Tarn Hows': {
    labels: ['tarn', 'busy'],
    description:
      'A landscaped tarn at 207m with a surfaced circular path. Very busy, and swimming is discouraged here.',
  },
  'Brown Cove Tarn': {
    labels: ['high tarn', 'wild'],
    description: 'A small dammed tarn at 617m in the cove north of Helvellyn.',
  },
  'Low Tarn': {
    labels: ['high tarn', 'wild'],
    description: 'A remote pair of small tarns at 517m on the flank of Yewbarrow above Wasdale.',
  },
  'Scoat Tarn': {
    labels: ['high tarn', 'wild', 'remote'],
    description: 'A deep, cold tarn at 600m under Scoat Fell, one of the remotest on the route.',
  },
  'Greendale Tarn': {
    labels: ['high tarn', 'wild'],
    description: 'A quiet tarn at 404m between Middle Fell and Seatallan above Wasdale.',
  },
  'Cam Spout': {
    labels: ['waterfall', 'gorge'],
    description: 'A long cascade at 474m where the upper Esk drops beneath Scafell.',
  },
  'Whorneyside Force': {
    labels: ['waterfall'],
    description: 'A clean fall on Buscoe Sike below Three Tarns, in upper Langdale.',
  },
  'High Force': {
    labels: ['waterfall'],
    description: 'A fall in the Aira Beck glen above Ullswater, upstream of Aira Force.',
  },
  'Scaleclose Force': {
    labels: ['waterfall'],
    description: 'A fall on the beck below Honister, close to the route.',
  },
  'Tilberthwaite Gill Waterfall': {
    labels: ['waterfall', 'mining'],
    description: 'Falls in a narrow mined ravine above Tilberthwaite, on the route to Wetherlam.',
  },
  'Birker Force': {
    labels: ['waterfall'],
    description: 'A fall on the edge of Birker Fell above Eskdale.',
  },
  'High Fall': {
    labels: ['waterfall'],
    description: 'A fall in the Rydal Beck valley behind Rydal Hall.',
  },
  'Buckstones Jump': {
    labels: ['river pool'],
    description: 'A pool on Rydal Beck, upstream in the valley behind Rydal.',
  },
  'Force Jump': {
    labels: ['river pool'],
    description: 'A pool below a fall on the River Kent above Staveley.',
  },
  'Lodore Falls': {
    labels: ['waterfall'],
    description: 'A fall in a wooded ravine at the head of Derwent Water; impressive only after rain.',
  },
  'Ashness Bridge': {
    labels: ['waterfall', 'viewpoint'],
    description: 'The much-photographed packhorse bridge on Watendlath Beck, with pools below.',
  },
  'Watendlath Beck': {
    labels: ['waterfall'],
    description: 'Falls on the beck between Watendlath and Derwent Water.',
  },
  'Holme Force': {
    labels: ['waterfall'],
    description: 'A wooded fall above Loweswater, quiet and little visited.',
  },
  'Tom Ghyll Waterfalls': {
    labels: ['waterfall'],
    description: 'Falls on the outflow below Tarn Hows.',
  },
  'Coniston Waterfall': {
    labels: ['waterfall'],
    description: 'Falls on Church Beck in the Coppermines valley above Coniston.',
  },
  'Stybeck Waterfall': {
    labels: ['waterfall'],
    description: 'A fall on the fellside above Thirlmere near Stybeck Farm.',
  },
  'Fisherplace Gill Waterfall': {
    labels: ['waterfall'],
    description: 'A cascade on Fisherplace Gill above Thirlspot.',
  },
  'Alcock Tarn': {
    labels: ['tarn', 'viewpoint'],
    description: 'A small dammed tarn at 370m above Grasmere, with a fine view down the vale.',
  },
  'Loughrigg Tarn': {
    labels: ['tarn'],
    description: 'A pretty lowland tarn at 97m below Loughrigg Fell, in pasture.',
  },
  'Tewet Tarn': {
    labels: ['tarn'],
    description: 'A shallow field tarn at 205m near Castlerigg, with a view to Blencathra.',
  },
  'Seathwaite Tarn': {
    labels: ['reservoir', 'remote'],
    description: 'A dammed tarn at 372m in a remote hollow under Grey Friar in the Duddon fells.',
  },
  'High Cascades': {
    labels: ['waterfall'],
    description: 'Upper falls in the Aira Beck glen.',
  },
};

// Curated peak notes. Everything else in the screened list still ships as a
// selectable summit with its verified height and position.
export const PEAK_NOTES = {
  'Scafell Pike': {
    star: true,
    labels: ['England’s highest', 'rocky', 'navigation'],
    description:
      "England's highest ground at 978m. A boulder-strewn summit plateau with a huge cairn; cairned throughout but genuinely serious in mist, where the plateau defeats casual navigation. Usual approach from the route is via Lingmell Col.",
  },
  Scafell: {
    star: true,
    labels: ['serious', 'scramble'],
    description:
      "Scafell Pike's separate and quieter neighbour at 964m. The direct link across Mickledore is blocked by Broad Stand, a rock climb — the walkers' ways round are Lord's Rake or the Foxes Tarn gully, both loose and both requiring care.",
  },
  'Great Gable': {
    star: true,
    labels: ['classic', 'heritage'],
    description:
      'The 899m fell on the Lake District National Park emblem, with the war memorial of the Fell and Rock Climbing Club on its summit rocks. Steep on every side; the usual line from Styhead is the Breast Route.',
  },
  'Great End': {
    labels: ['wild', 'gullies'],
    description:
      "The 910m northern buttress of the Scafell massif, with deep gullies holding snow late. Easily reached from Esk Hause and often missed by people hurrying to the Pike.",
  },
  Bowfell: {
    star: true,
    labels: ['classic', 'rocky'],
    description:
      'A 902m pyramid at the head of Langdale with a genuinely rocky top and the Great Slab on its flank. The Band gives a long but never technical ascent.',
  },
  'Crinkle Crags': {
    star: true,
    labels: ['scramble', 'navigation'],
    description:
      'A 859m switchback of five distinct tops. The Bad Step on the second crinkle is a short awkward scramble — it can be bypassed on the west. Confusing ground in cloud.',
  },
  'Esk Pike': {
    labels: ['quiet'],
    description: 'An 885m rocky top between Bowfell and Great End, on the Esk Hause crossing.',
  },
  Pillar: {
    star: true,
    labels: ['serious', 'remote'],
    description:
      'An 892m fell above Ennerdale, best known for Pillar Rock on its northern face — a true rock climb, not a walk. The summit itself is reached easily from Black Sail Pass.',
  },
  Helvellyn: {
    star: true,
    labels: ['classic', 'scramble', 'exposed'],
    description:
      'At 950m, the most-climbed high fell in the district, with a summit shelter and trig point. Approaching by Striding Edge and leaving by Swirral Edge is the classic round: both are Grade 1 scrambles with real exposure, and neither is sensible in high wind, ice or poor visibility.',
  },
  'Catstye Cam': {
    labels: ['shapely', 'quiet'],
    description:
      'A sharply conical 890m top just north of Helvellyn, often bypassed entirely despite being ten minutes off Swirral Edge.',
  },
  Blencathra: {
    star: true,
    labels: ['scramble', 'exposed', 'classic'],
    description:
      'An 868m fell with a superb north-eastern approach by Sharp Edge — a narrow, genuinely exposed Grade 1 arete that has caused many accidents and should be avoided when wet or windy. Scales Fell gives a straightforward alternative both up and down.',
  },
  Skiddaw: {
    star: true,
    labels: ['big', 'straightforward'],
    description:
      'At 931m, one of the four Lakeland fells over 3000ft, and the most straightforward of them — a long, relentless but untechnical pull on a made path.',
  },
  'High Street': {
    labels: ['roman road', 'broad'],
    description:
      'An 828m whaleback carrying the line of a Roman road, with a wall along the top. Broad and easy going, and the route already crosses it.',
  },
  'Kidsty Pike': {
    labels: ['viewpoint'],
    description: 'A 780m top with a neat peaked profile above Riggindale, overlooking Haweswater.',
  },
  'Harter Fell (Mardale)': {
    labels: ['viewpoint'],
    description:
      'A 778m fell above Nan Bield Pass, with a summit cairn built partly of old iron fence posts and a fine view down Haweswater.',
  },
  'Ill Bell': {
    labels: ['shapely', 'classic'],
    description:
      'The finest top on the Kentmere horseshoe at 757m, cone-shaped with three large cairns.',
  },
  'Thornthwaite Crag': {
    labels: ['landmark'],
    description: 'A 784m top marked by a 4m stone beacon, at the junction of several ridges.',
  },
  'Harrison Stickle': {
    star: true,
    labels: ['classic', 'rocky'],
    description:
      'The highest of the Langdale Pikes at 736m, an abrupt rocky top with the whole valley beneath it.',
  },
  'Pavey Ark': {
    star: true,
    labels: ['scramble', 'dramatic'],
    description:
      'A 700m crag above Stickle Tarn, crossed by Jack\'s Rake — a rising Grade 1 scramble up the face of the cliff that is exposed, polished and unforgiving when wet. The summit is reached easily from behind if the Rake is not wanted.',
  },
  'Pike o’ Stickle': {
    labels: ['rocky', 'heritage'],
    description:
      'A 709m rock thumb above Mickleden, with a neolithic axe factory in the scree below its summit.',
  },
  'Pike o’ Blisco': {
    labels: ['rocky', 'viewpoint'],
    description: 'A 705m top with two rocky summits and an outstanding view of the Crinkles.',
  },
  'Coniston Old Man': {
    star: true,
    labels: ['classic', 'mining'],
    description:
      'An 803m fell rising straight from the village, its flanks full of slate quarries and copper workings. Large summit cairn and a view to the sea.',
  },
  'Swirl How': {
    labels: ['ridge'],
    description: 'An 802m hub of the Coniston fells, reached from Levers Hause or the Prison Band.',
  },
  Wetherlam: {
    labels: ['mining', 'quiet'],
    description:
      'A 762m fell riddled with old mine levels and shafts on its southern flanks — stay on the paths.',
  },
  'Dow Crag': {
    star: true,
    labels: ['crag', 'dramatic'],
    description:
      'A 778m summit perched above five great climbing buttresses dropping to Goats Water. The walk up is easy; the north face is not.',
  },
  'Harter Fell (Eskdale)': {
    star: true,
    labels: ['shapely', 'rocky'],
    description:
      'A 653m fell of rocky tors above Eskdale, and one of the best-shaped small fells in the district. The true summit needs a short easy scramble.',
  },
  Haystacks: {
    star: true,
    labels: ['classic', 'heritage'],
    description:
      "At 597m, Wainwright's favourite fell and where his ashes were scattered. A knot of small tops, tarns and rock — far more interesting than its modest height suggests.",
  },
  'Fleetwith Pike': {
    labels: ['viewpoint', 'steep'],
    description:
      'A 648m fell whose nose rises straight from Gatesgarth at the head of Buttermere. Steep, direct, and a superb viewpoint down the valley.',
  },
  'High Stile': {
    labels: ['ridge', 'dramatic'],
    description:
      'The high point of the Buttermere ridge at 807m, looking straight down into the corrie above Bleaberry Tarn.',
  },
  'Red Pike (Buttermere)': {
    labels: ['ridge', 'red screes'],
    description: 'A 755m top of red syenite screes above Bleaberry Tarn.',
  },
  'Dale Head': {
    labels: ['viewpoint'],
    description:
      'A 753m fell above Honister with a tall slate summit cairn and a fine view down Newlands.',
  },
  Robinson: {
    labels: ['broad'],
    description: 'A 737m fell of rocky shelves at the western end of the Newlands ridge.',
  },
  'Cat Bells': {
    star: true,
    labels: ['classic', 'family', 'busy'],
    description:
      'A 451m ridge above Derwent Water, out of all proportion in popularity to its size — a short, rocky, thoroughly enjoyable up-and-down with a superb view over the lake.',
  },
  'Castle Crag': {
    labels: ['small', 'heritage', 'quarry'],
    description:
      'The only fell under 1000ft in the Wainwrights, at 290m. A quarried knoll in the Jaws of Borrowdale with a war memorial on top and a slate-spoil path.',
  },
  'Grisedale Pike': {
    labels: ['shapely', 'steep'],
    description: 'A 791m fell with a sharp profile above Braithwaite and a long ridge approach.',
  },
  Grasmoor: {
    labels: ['big', 'quiet'],
    description: 'At 852m the highest of the north-western fells, a broad whaleback above Crummock.',
  },
  'Crag Hill': {
    labels: ['ridge'],
    description: 'An 839m hub of the Coledale fells with a trig point and steep drops north.',
  },
  'Lonscale Fell': {
    labels: ['quiet', 'edge'],
    description: 'A 715m eastern outlier of Skiddaw with an abrupt edge above the Glenderaterra.',
  },
  Latrigg: {
    labels: ['viewpoint', 'easy'],
    description:
      'A 368m grassy hill directly above Keswick, with the best low-level view of Derwent Water and Borrowdale on the whole route.',
  },
  'Walla Crag': {
    labels: ['viewpoint', 'easy'],
    description: 'A 379m crag-edge above Derwent Water, minutes from the route.',
  },
  'St Sunday Crag': {
    star: true,
    labels: ['ridge', 'dramatic'],
    description:
      'An 841m fell with a long elegant ridge and the finest view of Helvellyn\'s eastern corries from across Grisedale.',
  },
  Fairfield: {
    labels: ['big', 'navigation'],
    description:
      'An 873m fell with a broad flat summit plateau that is confusing in cloud — the drops on the north side are abrupt.',
  },
  'Place Fell': {
    labels: ['viewpoint', 'quiet'],
    description: 'A 657m fell above Ullswater with a knobbly top and a superb lake view.',
  },
  'Angletarn Pikes': {
    labels: ['shapely', 'tarn'],
    description: 'A 567m twin-topped fell beside Angle Tarn, one of the prettiest small tops here.',
  },
  'Red Screes': {
    labels: ['viewpoint', 'steep'],
    description: 'A 776m fell rising directly from the top of the Kirkstone Pass, with a summit tarn.',
  },
  'Loughrigg Fell': {
    labels: ['easy', 'busy', 'viewpoint'],
    description:
      'A 335m maze of little tops, tarns and caves between Grasmere and Ambleside — much more rambling than its height suggests.',
  },
  'Silver How': {
    labels: ['easy', 'viewpoint'],
    description: 'A 395m top above Grasmere with a fine view of the vale and the Langdale Pikes.',
  },
  'Lingmoor Fell': {
    labels: ['viewpoint', 'quarry'],
    description:
      'A 469m ridge between the two Langdales, with old slate quarries and a first-rate view of the Pikes.',
  },
  'Illgill Head': {
    star: true,
    labels: ['dramatic', 'quiet'],
    description:
      'A 609m fell forming the top of the Wast Water Screes, which fall 500m straight into the deepest lake in England. Grassy and gentle from behind, spectacular at the edge.',
  },
  'Whin Rigg': {
    labels: ['dramatic', 'quiet'],
    description: 'The 535m southern end of the Wast Water Screes, above deep gullies.',
  },
  'Slight Side': {
    labels: ['quiet', 'rocky'],
    description: 'The 762m southern outpost of Scafell, a rocky top on the long Eskdale approach.',
  },
  Lingmell: {
    labels: ['viewpoint'],
    description:
      'An 800m shoulder of Scafell Pike with a tremendous view of the Gable and down Wasdale — often walked over without being noticed.',
  },
  'Kirk Fell': {
    labels: ['steep', 'quiet'],
    description: 'An 802m fell between Great Gable and Pillar, with steep grass on the Wasdale side.',
  },
  'Green Gable': {
    labels: ['quiet', 'viewpoint'],
    description:
      'An 801m top separated from Great Gable by Windy Gap, with the best close view of the parent fell.',
  },
  Yewbarrow: {
    labels: ['ridge', 'steep'],
    description: 'A 628m ridge above Wasdale with steep ends at both extremities.',
  },
  Glaramara: {
    labels: ['knobbly', 'quiet'],
    description: 'A 783m ridge of rocky knolls and small tarns above Borrowdale.',
  },
  'Allen Crags': {
    labels: ['quiet'],
    description: 'A 785m top on the Esk Hause crossing, an easy addition to a Scafell day.',
  },
  'Hard Knott': {
    labels: ['heritage', 'small'],
    description:
      'A 549m rocky fell above the pass, with the remains of the Roman fort of Mediobogdum on its shoulder.',
  },
  'Green Crag': {
    labels: ['quiet', 'rocky'],
    description: 'A 489m rocky tor on the Eskdale moors, rarely visited.',
  },
  'Muncaster Fell': {
    labels: ['easy', 'low'],
    description: 'A 231m wooded ridge near the coast at the very start and end of the route.',
  },
  'High Raise (Langdale)': {
    labels: ['central', 'broad'],
    description:
      'At 762m the geographical centre of the Lake District, a broad grassy dome with a wide view.',
  },
  'Sergeant Man': {
    labels: ['quiet', 'rocky'],
    description: 'A 736m rocky knoll on the shoulder of High Raise, more distinct than its parent.',
  },
  Ullscarf: {
    labels: ['remote', 'boggy'],
    description: 'A 726m watershed fell between Borrowdale and Thirlmere; wet underfoot and quiet.',
  },
  'Eagle Crag': {
    labels: ['dramatic', 'small'],
    description:
      'A 521m crag standing proud at the fork of Langstrath and Greenup — far more imposing than its height.',
  },
  'Great Dodd': {
    labels: ['broad', 'quiet'],
    description: 'An 857m grassy dome at the northern end of the Helvellyn range.',
  },
  Raise: {
    labels: ['quiet', 'ski'],
    description: 'An 883m fell holding the Lake District Ski Club tow on its northern slope.',
  },
  'White Side': {
    labels: ['quiet'],
    description: 'An 863m top on the main Helvellyn ridge, easily added.',
  },
  'Stybarrow Dodd': {
    labels: ['broad'],
    description: 'An 843m grassy top on the northern Helvellyn ridge.',
  },
  'Nethermost Pike': {
    labels: ['quiet', 'edge'],
    description: 'An 891m top immediately south of Helvellyn with a fine eastern edge, usually ignored.',
  },
  'Dollywaggon Pike': {
    labels: ['quiet'],
    description: 'An 858m top at the southern end of the Helvellyn ridge above Grisedale Tarn.',
  },
  'Sheffield Pike': {
    labels: ['quiet', 'mining'],
    description: 'A 675m fell between Glencoyne and Glenridding, above old lead workings.',
  },
  'Birkhouse Moor': {
    labels: ['approach'],
    description: 'A 718m shoulder crossed on the way to Striding Edge, with the Hole-in-the-Wall on it.',
  },
  'Bannerdale Crags': {
    labels: ['quiet', 'crag'],
    description: 'A 683m fell with a fine curving crag rim, behind Blencathra.',
  },
  'Bowscale Fell': {
    labels: ['quiet', 'tarn'],
    description: 'A 702m fell above Bowscale Tarn, one of the quietest of the northern fells.',
  },
  'Clough Head': {
    labels: ['quiet', 'trig'],
    description: 'A 726m fell at the north end of the Dodds with a steep western face.',
  },
  'Grey Friar': {
    labels: ['quiet'],
    description: 'A 773m western outlier of the Coniston fells, looking over the Duddon.',
  },
  'Great Carrs': {
    labels: ['heritage', 'ridge'],
    description:
      'A 785m top with the wreckage of a wartime Halifax bomber on the col below its summit.',
  },
  'Brim Fell': {
    labels: ['broad'],
    description: 'A 796m grassy top on the ridge north of Coniston Old Man.',
  },
  'Holme Fell': {
    labels: ['small', 'quarry'],
    description: 'A 317m knot of rock and old quarries with a view down Yewdale.',
  },
  'Black Fell': {
    labels: ['small', 'viewpoint'],
    description: 'A 323m top with a National Trust monument column and a wide low-level view.',
  },
  'High Spy': {
    labels: ['edge', 'quiet'],
    description: 'A 653m fell along the crag edge above the Jaws of Borrowdale.',
  },
  'Maiden Moor': {
    labels: ['ridge'],
    description: 'A 576m top continuing the Cat Bells ridge southward.',
  },
  'Grange Fell': {
    labels: ['small', 'wooded'],
    description: 'A 415m fell of wooded knolls in Borrowdale, with King\'s How as its finest top.',
  },
  Hindscarth: {
    labels: ['ridge'],
    description: 'A 727m fell with a long northern ridge into the Newlands valley.',
  },
  'Whiteless Pike': {
    labels: ['shapely'],
    description: 'A 660m peaked top on the ridge above Crummock Water.',
  },
  'Rannerdale Knotts': {
    labels: ['small', 'bluebells'],
    description:
      'A 355m rocky ridge above Crummock, famous for the bluebells that fill its valley in spring.',
  },
  Mellbreak: {
    labels: ['steep', 'quiet'],
    description: 'A 512m fell rising abruptly and independently from the shore of Crummock Water.',
  },
  'Hopegill Head': {
    labels: ['shapely', 'crag'],
    description: 'A 770m summit at the head of Hobcarton Crag, one of the sharpest tops here.',
  },
  Sail: {
    labels: ['zigzag'],
    description: 'A 773m top reached by an engineered zigzag path on the Coledale ridge.',
  },
  Outerside: {
    labels: ['quiet'],
    description: 'A 568m fell tucked below the Coledale ridge, usually bypassed.',
  },
  'Causey Pike': {
    labels: ['shapely', 'scramble'],
    description:
      'A 637m fell with an unmistakable knobbly summit and a short scramble to reach it.',
  },
  'Ard Crags': {
    labels: ['quiet', 'ridge'],
    description: 'A 581m narrow grassy ridge above the Newlands valley.',
  },
  'Knott Rigg': {
    labels: ['quiet', 'easy'],
    description: 'A 556m ridge walk from the top of Newlands Hause, little visited.',
  },
  'Skiddaw Little Man': {
    labels: ['viewpoint'],
    description: 'An 865m subsidiary top of Skiddaw with a better view than its parent.',
  },
  'Carl Side': {
    labels: ['approach'],
    description: 'A 746m top on the Longside ridge approach to Skiddaw.',
  },
  'Long Side': {
    labels: ['ridge'],
    description: 'A 734m top on the finest ridge approach to Skiddaw.',
  },
  'Ullock Pike': {
    labels: ['shapely', 'ridge'],
    description: 'A 692m sharp top beginning the Longside Edge ridge.',
  },
  Dodd: {
    labels: ['wooded', 'small'],
    description: 'A 502m forested cone below Skiddaw with a cleared summit viewpoint.',
  },
  'Great Calva': {
    labels: ['remote', 'heather'],
    description: 'A 690m heather fell deep in the Back o\' Skiddaw country.',
  },
  'Bleaberry Fell': {
    labels: ['quiet', 'boggy'],
    description: 'A 590m rocky top on the ridge above Keswick.',
  },
  'High Seat': {
    labels: ['boggy', 'quiet'],
    description: 'A 608m top on notoriously wet ground on the Central Ridge.',
  },
  'Lord’s Seat': {
    labels: ['quiet', 'forest'],
    description: 'A 552m high point of the Whinlatter fells, among forestry.',
  },
  Barf: {
    labels: ['steep', 'scree'],
    description: 'A 468m fell with a very steep scree face above Bassenthwaite.',
  },
  'Gray Crag': {
    labels: ['ridge', 'quiet'],
    description: 'A 699m long flat-topped ridge above Hayeswater.',
  },
  'Rest Dodd': {
    labels: ['quiet'],
    description: 'A 696m fell on the Martindale side of the High Street ridge.',
  },
  'The Knott': {
    labels: ['junction'],
    description: 'A 739m rounded top at a junction of ridges above Hayeswater.',
  },
  'Rampsgill Head': {
    labels: ['crag'],
    description: 'A 792m top with crags falling into Rampsgill, beside Kidsty Pike.',
  },
  'High Raise (High Street)': {
    labels: ['broad', 'quiet'],
    description: 'An 802m broad top, the highest of the far eastern fells after High Street.',
  },
  'Mardale Ill Bell': {
    labels: ['quiet'],
    description: 'A 760m top between Nan Bield and High Street, above Blea Water.',
  },
  Branstree: {
    labels: ['broad', 'quiet'],
    description: 'A 713m grassy fell above Haweswater with survey pillars on its flank.',
  },
  'Selside Pike': {
    labels: ['remote', 'quiet'],
    description: 'A 655m fell on the eastern fringe, with a summit shelter.',
  },
  Froswick: {
    labels: ['shapely'],
    description: 'A 720m cone on the Kentmere horseshoe, a smaller echo of Ill Bell.',
  },
  Yoke: {
    labels: ['broad', 'crag'],
    description: 'A 706m fell with Rainsborrow Crag on its Kentmere flank.',
  },
  'Stony Cove Pike': {
    labels: ['broad'],
    description: 'A 763m top also known as Caudale Moor, above the Kirkstone Pass.',
  },
  'Hartsop Dodd': {
    labels: ['steep', 'small'],
    description: 'A 618m steep-fronted top above Hartsop village.',
  },
  'Dove Crag': {
    labels: ['crag'],
    description: 'A 792m fell with a fine crag and the Priest\'s Hole cave beneath it.',
  },
  'Hart Crag': {
    labels: ['rocky'],
    description: 'An 822m rocky top on the Fairfield horseshoe.',
  },
  'Great Rigg': {
    labels: ['ridge'],
    description: 'A 766m top on the Fairfield horseshoe above Rydal.',
  },
  'Heron Pike': {
    labels: ['ridge', 'viewpoint'],
    description: 'A 612m top on the Rydal side of the Fairfield horseshoe.',
  },
  'Seat Sandal': {
    labels: ['quiet', 'steep'],
    description: 'A 736m fell above Grisedale Tarn and Dunmail Raise.',
  },
  'Beda Fell': {
    labels: ['quiet', 'ridge'],
    description: 'A 509m narrow ridge in Martindale, one of the quietest corners of the district.',
  },
  'Souther Fell': {
    labels: ['quiet', 'legend'],
    description:
      'A 522m fell famous for reported sightings of a spectral army on its slopes in the 18th century.',
  },
  'Mungrisdale Common': {
    labels: ['bleak', 'boggy'],
    description:
      'A 633m featureless expanse behind Blencathra, often called the dullest of the Wainwrights.',
  },
  'Rossett Pike': {
    labels: ['quiet'],
    description: 'A 651m top above Rossett Gill and Angle Tarn at the head of Langdale.',
  },
  'Seathwaite Fell': {
    labels: ['tarns', 'quiet'],
    description: 'A 632m knobbly fell of small tarns above Sprinkling Tarn.',
  },
  Brandreth: {
    labels: ['quiet'],
    description: 'A 715m broad top on the Honister to Gable ridge.',
  },
  'Grey Knotts': {
    labels: ['quiet', 'rocky'],
    description: 'A 697m rocky top directly above Honister Pass.',
  },
  'Base Brown': {
    labels: ['steep', 'quiet'],
    description: 'A 646m fell above Seathwaite with a steep nose and the Hanging Stone.',
  },
  Haycock: {
    labels: ['remote'],
    description: 'A 797m remote top on the western fells above Ennerdale.',
  },
  'Great Borne': {
    labels: ['remote'],
    description: 'A 616m fell at the western end of the Ennerdale ridge.',
  },
  'Starling Dodd': {
    labels: ['remote', 'quiet'],
    description: 'A 633m grassy top on the high ridge above Ennerdale.',
  },
  'Hen Comb': {
    labels: ['quiet', 'boggy'],
    description: 'A 509m isolated fell reached across marshy ground near Loweswater.',
  },
  'Blake Fell': {
    labels: ['quiet'],
    description: 'A 573m high point of the Loweswater fells.',
  },
  'Low Fell': {
    labels: ['viewpoint'],
    description: 'A 423m fell with one of the best views of the Buttermere valley.',
  },
  Fellbarrow: {
    labels: ['quiet', 'pastoral'],
    description: 'A 416m grassy top on the north-western fringe.',
  },
  'Cold Pike': {
    labels: ['quiet', 'rocky'],
    description: 'A 701m top of three rocky summits beside the Crinkles.',
  },
  'Loft Crag': {
    labels: ['rocky'],
    description: 'A 682m Langdale Pike above Gimmer Crag.',
  },
  'Blea Rigg': {
    labels: ['quiet', 'knobbly'],
    description: 'A 541m ridge of knolls between Easedale and Langdale.',
  },
  'Sergeant’s Crag': {
    labels: ['quiet', 'crag'],
    description: 'A 574m crag above Langstrath, next to Eagle Crag.',
  },
  'Glenridding Dodd': {
    labels: ['small', 'viewpoint'],
    description: 'A 442m small top above Glenridding with a good Ullswater view.',
  },
  Sallows: {
    labels: ['quiet', 'grassy'],
    description: 'A 516m grassy fell on the Kentmere fringe.',
  },
  'Sour Howes': {
    labels: ['quiet', 'grassy'],
    description: 'A 483m undulating fell above Troutbeck.',
  },
};
