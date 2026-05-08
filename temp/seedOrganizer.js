import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../src/models/users/user.js'; // Adjust the path if necessary

// Load environment variables (for your MongoDB URI)
dotenv.config();

const demoOrganizers = [
    {
        fullName: "Marcus Chen",
        email: "marcus@neonlights.inc",
        password: "Password123!",
        role: "organizer",
        organizationName: "Neon Lights Entertainment",
        city: "New York",
        phone: "5551112233",
        status: "approved"
    },
    {
        fullName: "Sarah Jenkins",
        email: "sarah@peakgatherings.com",
        password: "Password123!",
        role: "organizer",
        organizationName: "Peak Gatherings",
        city: "Denver",
        phone: "5552223344",
        status: "approved"
    },
    {
        fullName: "David Torres",
        email: "david@sonicbeats.net",
        password: "Password123!",
        role: "organizer",
        organizationName: "Sonic Beats Productions",
        city: "Miami",
        phone: "5553334455",
        status: "approved"
    },
    {
        fullName: "Emily Watson",
        email: "emily@cultureclash.org",
        password: "Password123!",
        role: "organizer",
        organizationName: "Culture Clash Arts",
        city: "London",
        phone: "5554445566",
        status: "approved"
    },
    {
        fullName: "James O'Connor",
        email: "james@techcon.dev",
        password: "Password123!",
        role: "organizer",
        organizationName: "TechCon Global",
        city: "San Francisco",
        phone: "5555556677",
        status: "approved"
    },
    {
        fullName: "Aisha Patel",
        email: "aisha@wellnessretreats.com",
        password: "Password123!",
        role: "organizer",
        organizationName: "Zen Wellness Retreats",
        city: "Austin",
        phone: "5556667788",
        status: "pending" // Left as pending so you can test your Admin approval UI!
    },
    {
        fullName: "Liam Murphy",
        email: "liam@indiefilmfest.com",
        password: "Password123!",
        role: "organizer",
        organizationName: "Indie Screenings",
        city: "Toronto",
        phone: "5557778899",
        status: "approved"
    },
    {
        fullName: "Sophia Garcia",
        email: "sophia@culinaryexpo.net",
        password: "Password123!",
        role: "organizer",
        organizationName: "Global Culinary Expo",
        city: "Chicago",
        phone: "5558889900",
        status: "rejected" // Left as rejected so you can test your rejected UI!
    },
    {
        fullName: "Omar Hassan",
        email: "omar@esportsarena.gg",
        password: "Password123!",
        role: "organizer",
        organizationName: "Elite eSports Arena",
        city: "Seattle",
        phone: "5559990011",
        status: "approved"
    },
    {
        fullName: "Chloe Dubois",
        email: "chloe@fashionweek.fr",
        password: "Password123!",
        role: "organizer",
        organizationName: "Avant-Garde Fashion",
        city: "Paris",
        phone: "5550001122",
        status: "approved"
    }
];

const seedDatabase = async () => {
    try {
        // 1. Connect to the database
        // Replace process.env.MONGO_URI with your actual connection string variable if it's named differently
        const dbUri = process.env.MONGO_URI || 'mongodb://localhost:27017/eventhub2'; 
        await mongoose.connect(dbUri);
        console.log('✅ Connected to MongoDB');

        // Optional: Uncomment the line below if you want to wipe all existing organizers before adding these
        // await User.deleteMany({ role: 'organizer' });
        // console.log('🗑️ Cleared old organizers');

        // 2. Loop through and save each user
        for (const orgData of demoOrganizers) {
            // Check if user already exists to prevent duplicate email errors
            const exists = await User.findOne({ email: orgData.email });
            if (!exists) {
                const newOrg = new User(orgData);
                await newOrg.save(); // .save() ensures pre-save password hashing hooks fire
                console.log(`➕ Added: ${orgData.organizationName}`);
            } else {
                console.log(`⏭️ Skipped: ${orgData.email} already exists`);
            }
        }

        console.log('🎉 Seeding complete!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Error seeding database:', error);
        process.exit(1);
    }
};

// Run the function
seedDatabase();