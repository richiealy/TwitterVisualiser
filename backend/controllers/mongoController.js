const mongoose = require('mongoose');
const tweet = require('../models/tweet_schema');
const crime = require('../models/crime_schema');
const ObjectId = require('mongodb').ObjectId;
const spawn = require('threads').spawn;
const connectionTimeout = 1500;

const databaseMelb = {location: "Melbourne", url : "mongodb://team:swinburne@43.240.97.166/tweets", type: "Production"};

const databaseChicago = {location: "Chicago", url : "mongodb://team:swinburne@43.240.97.166/tweetsChicago", type: "Production"};

const databaseChicagoCrime = {location:"Chicago Crime", url : "mongodb://team:swinburne@43.240.97.166/chicagoCrime", type: "Production"};

const connectFailure = function() {console.log("This will abort the NodeJS process."); process.exit(1);}

init();

function init()
{
	let tweetMelb = createDBConnectionObject(databaseMelb).model('tweets');

	let tweetChicago = createDBConnectionObject(databaseChicago).model('tweets');

	let chicagoCrime = createDBConnectionObject(databaseChicagoCrime).model('crime');

	module.exports.tweetMelb = tweetMelb;
	module.exports.tweetChicago = tweetChicago;
	module.exports.chicagoCrime = chicagoCrime;
}

function createDBConnectionObject(database)
{
	let conn = mongoose.createConnection(database.url, {connectTimeoutMS: connectionTimeout, useNewUrlParser: true});

	conn.on('error', ()=>{
		console.log("\nFailed to connect to the", database.type, database.location, "DB at", databaseMelb.url);
		connectFailure();
	});

	conn.on('open', ()=>{
		console.log("Connected to the", database.type, database.location,"DB at", databaseMelb.url)
	});

	return conn;
}

exports.getStoredTweets = async (location, query, count, skip) =>
{

	let result = [];
	if (location.toLowerCase() === "melbourne")
	{
		await this.tweetMelb.find(query).skip(skip).limit(parseInt(count)).lean().exec().then((res) => {result = res;});
	}
	else if (location.toLowerCase() === "chicago")
	{
		await this.tweetChicago.find(query).skip(skip).limit(parseInt(count)).lean().exec().then((res) => {result = res;});
	}


	return result;
	
}

exports.storeTweets = function(tweetsToStore, geo)
{
	if (process.env.DISABLE_DEVELOPER_MODE)
	{
		let id = Math.floor(Math.random() * Math.floor(25));

		const thread = spawn(function(input, done, progress) {
			const process = require('process');
			let filteredArray = [];
			let resultArray = [];

			const mongoose = require('mongoose');
			const tweet = require(process.cwd() + "/models/tweet_schema");

			mongoose.connect(input.database.url, { useNewUrlParser: true });

			let writeConnection = mongoose.connection;

			writeConnection.on('error', function ()
			{
				console.log("An error occurred while establishing a write connection to the", input.database.type, "database.");
				done();
			});

			writeConnection.on('open', async () =>
			{
				let writeModel = writeConnection.model('tweets');

				let alreadyInArray;

				for (let post in input.tweetsToStore) //This nested for loop checks that we don't have any duplicates in the array we get from Twitter
				{

					for (let j in filteredArray)
					{
						alreadyInArray = (input.tweetsToStore[post].full_text === input.tweetsToStore[j].full_text);

						if (alreadyInArray)
						{
							break;
						}

					}
					if (!alreadyInArray)
					{
						filteredArray.push(input.tweetsToStore[post]);
					}
				}

				progress(25);

				for (let post in filteredArray) //Check that items in the array aren't already in the DB
				{
					await writeModel.find({full_text: filteredArray[post].full_text}).lean().exec().then(function (result)
					{
						if (result.length === 0)
						{
							resultArray.push(filteredArray[post]);
						}
					})
				}

				progress(50);

				for (let post in resultArray) { //Save the documents to the DB one by one
					var dbTweet = new tweet();
					dbTweet.created_at = resultArray[post].created_at;
					dbTweet.id = resultArray[post].id;
					dbTweet.full_text = resultArray[post].full_text;
					dbTweet.user_id = resultArray[post].user_id;
					dbTweet.user_name = resultArray[post].user_name;
					dbTweet.user_location = resultArray[post].user_location;
					dbTweet.user_verified = resultArray[post].user_verified;
					dbTweet.user_profile_image_url = resultArray[post].user_profile_image_url;
					dbTweet.geo = resultArray[post].geo;
					dbTweet.coordinates = resultArray[post].coordinates;
					dbTweet.place = resultArray[post].place;
					dbTweet.checked = 0;
					dbTweet.crime = null;
					await dbTweet.save().catch(function(err){console.log(err)});
				}
				progress(100);
				done({}); //Notify parent we're done
			});
		});

		if (geo === "melbourne")
		{
			thread.send({tweetsToStore: tweetsToStore, database: databaseMelb})
				.on('progress', function(progress){
			})
				.on('message', function(){thread.kill()});

		}
		else if (geo === "chicago")
		{
			thread.send({tweetsToStore: tweetsToStore, database: databaseChicago})
				.on('progress', function(progress){
			})
				.on('message', function(){thread.kill()});
		}
	}
};

async function removeDuplicates(db) //deprecated
{
	let tweets = {};
	let dupsRemoved = 0;
	process.stdout.write("Retrieving DB... ");
	await db.find().lean().exec().then(function(result){tweets = result});

	process.stdout.write("Done!\n");
	process.stdout.write("Checking DB for duplicates... ");

	let count_outer = 0;
	for (let i in tweets)
	{
		let count_inner = 0;
		let first_instance = true;
		for (let j in tweets)
		{
			if (tweets[count_outer].full_text === tweets[count_inner].full_text)
			{
				if (!first_instance)
				{
					dupsRemoved += 1;
					db.remove({_id: ObjectId(tweets[count_inner]._id)}).exec();
				}
				else
				{
					first_instance = false;
				}

			}
			count_inner += 1;
		}

		count_outer += 1;
	}

	process.stdout.write("Done!\n")


	console.log("Removed " + dupsRemoved + " duplicates.");

};


