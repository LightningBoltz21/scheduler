import { scrapeCourse, scrapeSubjects, scrapeCourseList, CourseInfo } from './scraper';
import { DataWriter } from './writer';
import { getIntConfig, discoverLatestTerms, getTermCode, getTermName } from './utils';
import asyncPool from 'tiny-async-pool';
import * as path from 'path';

/**
 * Configuration from environment variables
 */
const SPECIFIED_TERMS = process.env.SPECIFIED_TERMS?.split(',').map(termStr => {
  const [year, term] = termStr.trim().split('/');
  return { year, term };
});

const CONCURRENCY = getIntConfig('CONCURRENCY') ?? 2;
const REQUEST_DELAY_MS = getIntConfig('REQUEST_DELAY_MS') ?? 500;
const COURSES_PER_SUBJECT = getIntConfig('COURSES_PER_SUBJECT') ?? null; // null = all courses
const OUTPUT_DIR = path.join(__dirname, '..', 'data');

/**
 * Sleep for specified milliseconds with optional jitter to appear more human
 * @param ms - Base milliseconds to sleep
 * @param jitterPercent - Percentage of jitter (0-1), default 0.3 = ±30%
 */
function sleep(ms: number, jitterPercent: number = 0.3): Promise<void> {
  // Add random jitter to make requests less predictable
  const jitter = ms * jitterPercent * (Math.random() * 2 - 1);
  const actualDelay = Math.max(100, ms + jitter); // Minimum 100ms
  return new Promise(resolve => setTimeout(resolve, actualDelay));
}

let totalRequests = 0;
let rateLimitCount = 0;
let forbidden403Count = 0;
const MAX_403_ERRORS = 1; // Abort on first 403 and save progress
let abortRequested = false;

/**
 * Scrape a single course with rate limiting delay
 */
async function scrapeWithDelay(
  year: string,
  term: string,
  course: CourseInfo,
  delayMs: number = 500
): Promise<{ course: CourseInfo; data: any; success: boolean }> {
  // Check if abort was requested
  if (abortRequested) {
    return { course, data: null, success: false };
  }

  // Add delay before EACH request for rate limiting (with jitter)
  await sleep(delayMs);
  totalRequests++;
  
  try {
    const scraped = await scrapeCourse(year, term, course.subject, course.number);
    return { course, data: scraped, success: true };
  } catch (error: any) {
    // Check for 403 Forbidden errors
    if (error.response?.status === 403) {
      forbidden403Count++;
      console.error(`\n❌ 403 Forbidden on ${course.subject} ${course.number}`);
      console.error(`🛑 ABORTING: UIUC server blocked request`);
      console.error(`   Stopping scraper...\n`);
      abortRequested = true;
      return { course, data: null, success: false };
    }
    
    if (error.response?.status === 429) {
      rateLimitCount++;
      console.log(`  ⚠️  Rate limited on ${course.subject} ${course.number}`);
      
      if (rateLimitCount > 5) {
        console.warn(`\n⚠️⚠️⚠️  EXCESSIVE RATE LIMITING! (${rateLimitCount} times)`);
        console.warn(`Consider stopping and reducing CONCURRENCY or increasing REQUEST_DELAY_MS\n`);
      }
    }
    
    // Don't spam errors if we're aborting
    if (!abortRequested) {
      console.error(`  ❌ Failed to scrape ${course.subject} ${course.number}:`, error.message);
    }
    return { course, data: null, success: false };
  }
}

/**
 * Main entry point for UIUC Crawler v3
 */
async function main() {
  console.log('🚀 UIUC Crawler v3 - Bulk Scraping Mode\n');
  console.log(`Configuration:`);
  console.log(`  - CONCURRENCY: ${CONCURRENCY}`);
  console.log(`  - REQUEST_DELAY_MS: ${REQUEST_DELAY_MS}`);
  if (COURSES_PER_SUBJECT !== null) {
    console.log(`  - COURSES_PER_SUBJECT: ${COURSES_PER_SUBJECT} (testing mode)`);
  } else {
    console.log(`  - COURSE_LIMIT: NONE (full scrape)`);
  }
  console.log(`  - OUTPUT_DIR: ${OUTPUT_DIR}\n`);
  
  // Determine which terms to scrape
  const termsToScrape = SPECIFIED_TERMS || await discoverLatestTerms(2);
  
  if (termsToScrape.length === 0) {
    console.error('❌ No terms to scrape');
    return;
  }

  console.log(`📅 Terms to scrape:`);
  termsToScrape.forEach(({ year, term }) => {
    console.log(`  - ${getTermName(year, term)} (${year}/${term})`);
  });
  console.log();

  const allTermData: Array<{ termCode: string; termName: string; data: any }> = [];

  for (const { year, term } of termsToScrape) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📅 Processing ${getTermName(year, term).toUpperCase()}...`);
    console.log('='.repeat(60) + '\n');
    
    try {
      // Step 1: Get all subjects
      console.log('🔍 Step 1: Discovering subjects...');
      const subjects = await scrapeSubjects(year, term);
      
      if (subjects.length === 0) {
        console.log(`  ⚠️  No subjects found for ${term} ${year}, skipping...`);
        continue;
      }

      // Step 2: Get all courses for each subject
      console.log('\n🔍 Step 2: Discovering courses...');
      const allCourses: CourseInfo[] = [];
      let subjectIndex = 0;
      const totalSubjects = subjects.length;
      
      for (const subject of subjects) {
        subjectIndex++;
        const courses = await scrapeCourseList(year, term, subject);
        
        if (COURSES_PER_SUBJECT !== null && courses.length > 0) {
          // Take first N courses from this subject
          const coursesToTake = courses.slice(0, COURSES_PER_SUBJECT);
          allCourses.push(...coursesToTake);
          console.log(`    ✓ Found ${courses.length} courses in ${subject}, taking first ${coursesToTake.length}`);
        } else {
          allCourses.push(...courses);
          console.log(`    ✓ Found ${courses.length} courses in ${subject}`);
        }
        
        // Show progress every 20 subjects
        if (subjectIndex % 20 === 0 || subjectIndex === totalSubjects) {
          console.log(`  📊 Progress: ${subjectIndex}/${totalSubjects} subjects (${allCourses.length} courses found)`);
        }
        
        // Conservative delay between subjects (with jitter)
        await sleep(1000, 0.3);
      }
      
      console.log(`\n  📚 Total courses discovered: ${allCourses.length}`);
      if (COURSES_PER_SUBJECT !== null) {
        console.log(`  ⚠️  COURSES_PER_SUBJECT mode: Testing with ${COURSES_PER_SUBJECT} courses per subject`);
      }

      if (allCourses.length === 0) {
        console.log(`  ⚠️  No courses found for ${term} ${year}, skipping...`);
        continue;
      }

      // Scrape all courses for this term
      const termCode = getTermCode(year, term);
      const coursesToScrape = allCourses;

      // Step 3: Scrape remaining courses in parallel
      console.log('🔍 Step 3: Scraping courses in parallel...');
      const writer = new DataWriter();
      const coursesMap: Record<string, any> = {};
      let successCount = 0;
      let failureCount = 0;

      // Progress tracking
      let completed = 0;
      const startTime = Date.now();

      // Reset abort flag for each term
      abortRequested = false;
      forbidden403Count = 0;
      
      // Collect all results from parallel scraping
      const results = await asyncPool(CONCURRENCY, coursesToScrape, async (course: CourseInfo) => {
        // Skip if abort requested
        if (abortRequested) {
          return { course, data: null, success: false };
        }
        return await scrapeWithDelay(year, term, course, REQUEST_DELAY_MS);
      });

      // Process all results (asyncPool returns AsyncIterableIterator)
      for await (const result of results) {
        completed++;
        
        if (result.success && result.data) {
          const convertedCourse = writer.convertCourse(result.data);
          const courseKey = `${result.course.subject} ${result.course.number}`;
          coursesMap[courseKey] = convertedCourse;
          successCount++;
        } else {
          failureCount++;
        }

        // Log progress every 10 courses in test mode, 50 in full mode
        const progressInterval = COURSES_PER_SUBJECT !== null ? 10 : 50;
        if (completed % progressInterval === 0 || completed === coursesToScrape.length) {
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          const rate = (completed / (Date.now() - startTime) * 1000).toFixed(1);
          const eta = coursesToScrape.length > completed 
            ? ((coursesToScrape.length - completed) / parseFloat(rate)).toFixed(0)
            : '0';
          console.log(`  Progress: ${completed}/${coursesToScrape.length} (${rate}/s, ETA: ${eta}s, Rate limits: ${rateLimitCount})`);
        }
        
        // Check if we should abort
        if (abortRequested) {
          break;
        }
      }
      
      // Handle abort scenario
      if (abortRequested) {
        console.error(`\n❌ Scraping aborted due to 403 Forbidden error`);
        console.error(`   Successfully scraped this run: ${successCount} courses`);
        console.error(`   Failed/Skipped: ${failureCount} courses\n`);
        
        // Write partial data if any was collected
        if (successCount > 0) {
          console.log('💾 Step 4: Writing partial data before exit...');
          
          const termData = writer.generateTermData(coursesMap);
          const termName = getTermName(year, term);
          
          const totalCourses = Object.keys(coursesMap).length;
          
          console.log(`  ✓ Courses scraped: ${successCount}`);
          console.log(`  ✓ Total courses: ${totalCourses}`);
          
          writer.writeTermData(termData, termCode, OUTPUT_DIR);
          allTermData.push({ termCode, termName, data: termData });
          
          console.log(`\n✅ Data saved! Run scraper again to continue where you left off.\n`);
        } else {
          console.error(`   No courses scraped, no data written.\n`);
        }
        
        // Exit with error code so GitHub Actions knows it failed
        process.exit(1);
      }

      // Step 4: Generate and write output (merge with existing)
      console.log('\n📦 Step 4: Building term data...');
      
      const termData = writer.generateTermData(coursesMap);
      const termName = getTermName(year, term);
      
      const totalCourses = Object.keys(coursesMap).length;
      
      console.log(`  ✓ Total courses: ${totalCourses}`);
      console.log(`  ✓ Success: ${successCount}, Failed: ${failureCount}`);
      console.log(`  ✓ Cached periods: ${termData.caches.periods.length}`);
      console.log(`  ✓ Cached locations: ${termData.caches.locations.length}`);
      console.log(`  ✓ Cached scheduleTypes: ${termData.caches.scheduleTypes.length}`);

      // Write term data JSON
      console.log('\n💾 Writing output file...');
      writer.writeTermData(termData, termCode, OUTPUT_DIR);

      allTermData.push({ termCode, termName, data: termData });

      const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\n✨ ${getTermName(year, term)} complete in ${totalTime}s!`);

    } catch (error: any) {
      console.error(`\n❌ Failed to process ${term} ${year}:`, error.message);
      console.error(error);
    }
  }

  // Write index.json with all terms
  if (allTermData.length > 0) {
    console.log('\n' + '='.repeat(60));
    console.log('📝 Writing index.json with all terms...');
    const writer = new DataWriter();
    const terms = allTermData.map(t => ({
      term: t.termCode,
      name: t.termName
    }));
    writer.writeIndex(terms, OUTPUT_DIR);
    console.log('='.repeat(60));
  }

  console.log('\n✨ All crawling complete!\n');
  console.log(`📂 Output directory: ${OUTPUT_DIR}`);
  console.log(`📄 Files created:`);
  allTermData.forEach(t => {
    console.log(`   - ${t.termCode}.json (${t.termName})`);
  });
  console.log(`   - index.json`);
}

// Run the crawler
main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
