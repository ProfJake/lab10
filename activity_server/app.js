
/*app.js
Jake Levy
Nov 2020

This the activity DB server program (insert and search)
modified to work with Express App.  Express allows us to 
write code that is easier to read and follow by handling
routing automatically for us.  We no longer need long if/else
chains to figure out how to route requests for our applications.

Instead we can create an instance of the Express routing "app" 
and tell it which combination of Routes and HTTP methods 
to which we want it to respond*/
var tracker = require("tracker");
let crypto= require("crypto");
var http = require("http");
var qString = require("querystring");
//this calls the let db={}; and instantiates the db for us
let dbManager = require('./dbManager');
let express = require("express");
let session = require("express-session");
let bp = require("body-parser");
let app = express();
var ObjectID = require('mongodb').ObjectId;
var mongoNum = require('mongodb').Number;

let localUser;
//This will take a set of properties that are coming in from a "POST"
//And transform them into a document for inserting into the "activities"
// collection
function genHash(input){
    return Buffer.from(crypto.createHash('sha256').update(input).digest('base32')).toString('hex').toUpperCase();
}
function docifyActivity(params){
    let doc = { activity: { type: params.activity }, weight: params.weight,
		distance: params.distance, time: params.time, user: params.user};
    return doc;
}
function received(req, res, next){
	console.log("Request for " + req.url+ " Page " + new Date().toLocaleTimeString("en-US", { timeZone: "America/New_york"}));
	next();
}
var postParams;
function moveOn(postData){
    let proceed = true;
    postParams = qString.parse(postData);
    //handle empty data
    for (property in postParams){
	if (postParams[property].toString().trim() == ''){
	    proceed = false;
	}
    }

    return proceed;
}

//The order of provided routing functions matters.  They work similarly to
//cases in a switch statement.  The first matching route is run.
//the response methods 'send' and 'end' will end the "request response cycle"
//If the cycle is not ended then the request will "hang".
// These are NOT the same methods provided by the standard response object of HTTP
//But instead are methods provided by Express.   A full list of methods that can
//be used to end the cycle
app.set('views', './views');
app.set('view engine', 'pug');
app.use(received);
app.use(session({
	secret:'shhhhh',
	saveUninitialized: false,
	resave: false
}));
//GET ROUTES
//These callback functions in "Express syntax" are called "middleware" functions.
//They sit "in the middle" between your app's backend end functionality
//(in this case, the simple Activity Class, MongoDB, and/or the local
//"server" filesystem) and the client.  Middleware function's 
app.get('/', function (req, res){
	if (!req.session.user){
		res.redirect('/login');
	} else {
   // res.end('<html><body><br><br><a href="/insert">home/insert</a>&emsp;&emsp;<a href="/search">search Page</a></body></html>');
		res.render('index', { trustedUser: localUser });
	}
//console.log(req.session.id);
});

app.get('/login', function(req, res, next){
if (req.session.user){
	res.redirect('/');
} else {
	res.render('login')
}
});
app.get('/insert', function (req, res){
   // let page = servResp(null, res);
	//    res.send(page);
	if (!req.session.user){
		res.redirect('/login');
	} else {
	res.render('insert', {trustedUser: localUser});
	}
});
//demonstrates error handling with Express
//This error is unlikely but this middleware function demonstrates how to use
//Express to process caught errors.  Passing errors to the "next" function
//allows Express to catch them and do its own error handling

//Signup only appears to users who haven't logged in
app.get('/signup', (req, res, next)=>{
	if (req.session.user){
		res.redirect('/');
	}else {
		res.render('signup');
	}

})
app.get('/search', function(req, res, next){
//    searchResp(null, res).then(
//	page=> {    res.send(page); }
	//    ).catch(next);
	if (!req.session.user){
		res.redirect('/login');
	} else {
	res.render('search', { trustedUser: localUser});
	}
});
app.param('actID', function(req, res, next, value){
    console.log(`Request for activity ${value}`);
    next();
});
app.get('/users/:userID', async (req, res)=> {
	if (!req.session.user){
		res.redirect('/login');
	} else {
    let users = dbManager.get().collection("users");
    let activities = dbManager.get().collection("activities");

    try{

	let user=await users.findOne({_id: req.params.userID});

	let actCursor = activities.find({ user: req.params.userID});

	let actArr = await actCursor.toArray();
	let current;
	for (item in actArr){
	    current = new tracker(actArr[item].activity.type, actArr[item].weight, actArr[item].distance, actArr[item].time);
	    actArr[item].calories = current.calculate();
	    console.log("Calories: " + current.calculate());
	}
	res.render('user', { trustedUser: localUser, searchID: user._id, activities: actArr});
    }catch (err){
	console.log(err.message);
	res.status(500).render('error', {trustedUser: localUser, errorStat: 500, errorMSG: err.message});
    }

}
    
});
app.get('/activities/:actID', async function(req, res){
	if (!req.session.user){
		res.redirect('/login');
	} else {
    let col = dbManager.get().collection("activities");
    try{
	let result = await col.findOne({ _id: ObjectID(req.params.actID) });
	console.log(result);

	res.render('activity', { trustedUser: localUser, searchID: result.user, exercise: result.activity.type, distance: result.distance, weight: result.weight })
    }catch(e){
	console.log(e.message);
	}
}
});
var postData;

//POST ROUTES
app.post('/signup', bp.urlencoded({extended: false}), async (req, res, next)=>{
	//1) sending the user an email to verify is the best course of action
	//then only entering a new user When its verified by clicking a link in the email
	//(obviously you need a route to match that link)

	//2) otherwise you could always immediately enter a user into a special "nerfed" collection. 
	//Users in "nerfed" have limited access and permissions until they verify email, at which
	//point they could be moved into a "full membership" collection
	let exists;
	let newUser;
	let check = false;
	
	newUser = {_id: req.body.user, name: req.body.name, email: req.body.email, age: Number(req.body.age), email_verified: false};
	try{
	//Lookup users by email and see if the email is already registered

	 exists = await dbManager.get().collection("users").findOne({email: req.body.email}, {_id:0, email: 1});
	//if no email is found, exists is null
	} catch (err){
		//catch any weird DB errors
		console.log(err.message);
	}finally{
		if (exists)	{
			//use standard error template
			res.render('error', {errorStat: 500, errorMSG: `${req.body.email} Already Exists in DB`});
		 }
		else {
			try{
			await dbManager.get().collection("users").insertOne(newUser)
			} catch (err){
				//incase the user name is already in the DB (throws error)
				console.log(err)
				res.render('error',{errorStat: 500, errorMSG: `${err.message}`} )
			}
			//otherwise ask them to login
			res.redirect('/login')
		}
	}
})
//add another get or post to respond email ling
app.post('/login', bp.urlencoded({extended: false}), async ( req, res, next)=>{
let untrusted = {user: req.body.userName, password: genHash(req.body.password)};
try{
	let result = await dbManager.get().collection("users").findOne({_id: req.body.userName})

	if (untrusted.password.toString().toUpperCase() == result.password.toString().toUpperCase()){
		let trusted={ name: result._id.toString()};
		req.session.user = trusted;
		//app.locals.user = result;
		localUser = result;
		res.redirect('/');
		}
	} catch (err){
	console.log(err.message)
	next(err);
}
});
app.post('/insert', function(req, res){
    postData = '';
    req.on('data', (data) =>{
	postData+=data;
    });
    req.on('end', async ()=>{
	//Break into functions
	console.log(postData);
	if (moveOn(postData)){
	    let col = dbManager.get().collection("activities");
	    //on the insert page
		try{
		    //if the data is bad, object creation throws an
		    //error (as we have seen since Week 4).
		    //And no document will be inserted
		    var curTracker = new tracker(postParams.activity,
						 postParams.weight,
						 postParams.distance,
						 postParams.time);
		    calories = curTracker.calculate();
		    
		    //convert params to a document for Mongo
		    let curDoc = docifyActivity(postParams);

		    //insert the document into the db
		    let result = await col.insertOne(curDoc);
		    //return calories as response (Success)
//		    let page =  servResp(calories, res);
		    res.render('insert', { trustedUser: localUser, calories: calories});
		    console.log(result); //log result for viewing
		} catch (err){
		    calories = "ERROR! Please enter appropriate data";
		    console.log(err.message);
//		    let page = servResp(calories, res);
		    res.render('insert', { trustedUser: localUser, calories: calories});
		    //res.send(page);
		}
	} else{ //can't move on
	    calories = "Error! All Fields must have Data";
	    
//	    let page =  servResp(calories, res);
	    res.render('insert', { trustedUser: localUser, calories: calories});
//	    res.send(page);
	}
    });
    	    
});

app.post('/search', function(req, res){
    postData = '';
    req.on('data', (data) =>{
	postData+=data;
    });
    req.on('end', async ()=>{
	//Break into functions
	console.log(postData);
	if (moveOn(postData)){
	    let col = dbManager.get().collection("activities");
	    var prop= postParams.prop;
	    var val = postParams.value;
	    if (prop != "user" && prop != "activity.type"){
		val = Number(postParams.value);
	    }
	    //simple equality search. using [] allows a variable
	    //in the property name
	    let searchDoc = { [prop] : val };
	    try{
		let cursor = col.find(searchDoc,  {
		    projection: {  activity: 1, distance: 1, user: 1, time: 1, weight: 1}}).sort({distance: -1});
	
		let data = [];
		
		await cursor.forEach((item)=>{
		    let curTrack={};   
		    curTrack.calories =  new tracker(item.activity.type, item.weight, item.distance, item.time).calculate();
		    curTrack.user = item.user;
		    curTrack._id=item._id;
		    data.push(curTrack);
		})
		let resultOBJ={dataArr: data , [prop]  : val, prop: prop};

		res.render('search', { trustedUser: localUser, results: resultOBJ});
		
//		searchResp(resultOBJ, res).then( page =>
//						  {res.send(page)
//						  });//call the searchPage
	    } catch (e){
		console.log(e.message);
		res.writeHead(404);
		res.write("<html><body><h1> ERROR 404. Page NOT FOUND</h1>");
		res.end("<br>" + e.message + "<br></body></html>");
	    }
	} else{ // can't move on
	   // searchResp(null, res).then(
	    //	page => {res.send(page)}
	    //	);
	    res.render('search', {trustedUser: localUser});
	}
    });
});
//Routes are loaded *in order*.  Like Switch cases, if a route
//gets matched early then it won't match later routes.  So
//RUNS for any ROUTE not matched to those methods above
app.use('*', function(req, res){

    res.writeHead(404);
    res.end(`<h1> ERROR 404. ${req.url} NOT FOUND</h1><br><br>`);
});
app.use(function(err, req, res, next){
	res.writeHead(500);//internal server error
	res.render('error', {trustedUser: localUser, errorStat: 500, errorMSG: err.message});
});


//Express listen function is literally the HTTP server listen method
//so we can do the exact same things with it as before
app.listen(3000, async ()=> {
    //start and wait for the DB connection
    try{
        await dbManager.get("practiceDB");
    } catch (e){
        console.log(e.message);
    }

    console.log("Server is running...");
});
