# README.md — Data Mining Academic Course References & Practice Sets

- **Motivation/Background**: Foundational literature, lecture slide decks, and exercise problem sets for the Data Mining curriculum (Chapters 4 through 7 covering Classification, Association Analysis, and Clustering).
- **Purpose**: Document and index the reference PDF slide decks, practice exercise problem sheets, and reference diagrams stored in `docs/references/`.
- **Overview Pipeline**: 
  1. Lecture Slides (Chapters 4–7) covering core data mining algorithms implemented in the lakehouse (FP-Growth, PageRank, clustering, and decision trees).
  2. Practice problem sheets and exercises (Practice 1, 2, and 3).
- **Detailed Plan**: §1 Lecture Slides Inventory; §2 Practice Problem Sets; §3 Relevance to Scientific Lakehouse Pipelines.
- **References**: `agents/rules/COMMIT_CONVENTION.md`, `agents/rules/MD_CONVENTION.md`, `data/gold/mining/association_rules.json`.
- **Created**: 2026-10-12T12:25:00+07:00
- **Last Updated**: 2026-10-12T12:25:00+07:00

---

## 1. Lecture Slides Inventory

| File | Topic / Description | Target Algorithms & Methods |
| :--- | :--- | :--- |
| [`Chapter4.pdf`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/Chapter4.pdf) | Classification: Basic Concepts & Model Evaluation | Decision Trees, Overfitting, Model Evaluation Metrics |
| [`Chapter5_part1.pdf`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/Chapter5_part1.pdf) | Classification: Alternative Techniques (Part 1) | Rule-Based Classifiers, Nearest-Neighbor (k-NN) |
| [`Chapter5_part2.pdf`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/Chapter5_part2.pdf) | Classification: Alternative Techniques (Part 2) | Bayesian Classifiers, Naive Bayes, Support Vector Machines (SVM) |
| [`Chapter5_part3.pdf`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/Chapter5_part3.pdf) | Classification: Alternative Techniques (Part 3) | Ensemble Methods: Bagging, Boosting (AdaBoost), Random Forests |
| [`Chapter6.pdf`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/Chapter6.pdf) | Association Analysis: Basic Concepts & Algorithms | Apriori Principle, Frequent Itemset Generation, FP-Growth, Rule Generation |
| [`Chapter7.pdf`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/Chapter7.pdf) | Cluster Analysis: Basic Concepts & Algorithms | Partitioning (k-Means), Hierarchical Clustering, Density-Based (DBSCAN) |

---

## 2. Practice Problem Sets

| File | Format | Description |
| :--- | :--- | :--- |
| [`practice1.pdf`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/practice1.pdf) | PDF | Practice Problem Set 1: Data Preprocessing & Distance Metrics |
| [`practice2.pdf`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/practice2.pdf) | PDF | Practice Problem Set 2: Classification & Decision Trees |
| [`pracitce 3.png`](file:///C:/document/Study%20documents/Uth-Data-Mining/docs/references/pracitce%203.png) | PNG | Practice Problem 3: Association Rule Mining & FP-Tree Diagram |

---

## 3. Pipeline Implementation Mapping

These academic references directly guide the analytical components in our Lakehouse Gold tier:
- **Chapter 6 (Association Analysis)** $\to$ Implemented in `src/mining/association_rules.py` producing `data/gold/mining/association_rules.json`.
- **Chapter 7 (Clustering)** $\to$ Implemented in `src/mining/clustering.py` and visualized in the UI EDA tab.
- **Chapter 4 & 5 (Evaluation & Metrics)** $\to$ Grounding metrics for RAG retrieval and citation PageRank analysis in `src/mining/graph_analytics.py`.
