import cron from 'node-cron';
import Event from '../models/events/event.model.js';

const initCronJobs = () => {

    const scheduleDuration = process.env.CRON_SCHEDULE || '0 0 * * *';
    // Run every hour to check for expired events
    cron.schedule(scheduleDuration, async () => {
        try {
            console.log('⏳ Running cron job: Checking for expired events...');
            const now = new Date();
            
            const result = await Event.updateMany(
                { status: { $in: ['approved', 'published'] }, endDate: { $lt: now } },
                { $set: { status: 'completed' } }
            );

            if (result.modifiedCount > 0) {
                console.log(`✅ Cron Job: Marked ${result.modifiedCount} events as completed.`);
            } else {
                console.log('✅ Cron Job: No expired events found.');
            }
        } catch (error) {
            console.error('❌ Error in expired events cron job:', error);
        }
    });
};

export default initCronJobs;
