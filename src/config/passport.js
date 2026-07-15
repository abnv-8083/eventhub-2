import passport from "passport";

import { Strategy as GoogleStrategy } from "passport-google-oauth20";

import User from "../models/users/user.model.js";

console.log("Checking ID:", process.env.GOOGLE_CLIENT_ID)
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL,
},
    async (accessTocken, refreshTocken, profile, done)=>{
        try {
            let user = await User.findOne({email: profile.emails[0].value})

            const profileImageUrl = profile.photos && profile.photos.length > 0 
                                ? profile.photos[0].value 
                                : '';
            
            if (user && user.isBlocked) {
                return done(null, false, { message: 'Your account is blocked by the admin.' });
            }

            if(!user){
                user = await User.create({
                    fullName: profile.displayName,
                    email: profile.emails[0].value,
                    role: 'user',
                    googleId: profile.id,
                    avatar: profileImageUrl
                })
            }else{
                let updated = false;
                if (!user.googleId) {
                    user.googleId = profile.id;
                    updated = true;
                }
                if (!user.avatar && profileImageUrl) {
                    user.avatar = profileImageUrl;
                    updated = true;
                }
                if (updated) await user.save();
            }
            return done(null, user)
        } catch (error) {
            return done(error, null)
        }
    }))

    passport.serializeUser((user,done)=>done(null, user.id))
    passport.deserializeUser(async (id, done) =>{
        const user = await User.findById(id)
        done(null, user)
    })