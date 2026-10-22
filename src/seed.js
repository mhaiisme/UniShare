/**
 * Khởi tạo dữ liệu quy mô thực tế cho UniShare:
 *  - 12 trường đại học, 60 môn học
 *  - 750 tài khoản sinh viên + 1 tài khoản quản trị
 *  - ~1.800 tài liệu học tập, ~3.600 đánh giá, ~1.200 lượt mua, ~2.200 lượt mở khoá
 *  - ~320 tin bán/trao đổi giáo trình cũ, ~140 đơn hàng
 *  - ~160 bài thảo luận diễn đàn, ~550 bình luận, ~80 bộ flashcard
 */
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./db');
const config = require('./config');
const { sqlNow, stripDiacritics } = require('./utils');

const SCHOOLS = [
  ['HUST', 'ĐH Bách khoa Hà Nội', 'sis.hust.edu.vn', ['Khoa học máy tính', 'Kỹ thuật máy tính', 'Kỹ thuật điện – điện tử', 'Cơ điện tử', 'Toán – Tin'], [
    ['MI1111', 'Giải tích I', ['Giới hạn dãy và hàm', 'Đạo hàm và vi phân bậc cao', 'Khai triển Taylor – Maclaurin', 'Tích phân bất định và xác định', 'Hàm nhiều biến và cực trị']],
    ['MI1141', 'Đại số', ['Hệ phương trình tuyến tính Gauss', 'Không gian vector và cơ sở', 'Ánh xạ tuyến tính', 'Giá trị riêng và chéo hoá ma trận', 'Dạng toàn phương']],
    ['IT3011', 'Cấu trúc dữ liệu và giải thuật', ['Độ phức tạp thuật toán Big-O', 'Danh sách liên kết, ngăn xếp, hàng đợi', 'Cây nhị phân tìm kiếm và AVL', 'Bảng băm và xử lý va chạm', 'Đồ thị BFS, DFS, Dijkstra']],
    ['IT3080', 'Mạng máy tính', ['Mô hình OSI và TCP/IP', 'Tầng ứng dụng HTTP, DNS, SMTP', 'Tầng giao vận TCP, UDP, kiểm soát tắc nghẽn', 'Định tuyến IP, OSPF, BGP', 'Tầng liên kết dữ liệu Ethernet, ARP']],
    ['IT3070', 'Nguyên lý hệ điều hành', ['Tiến trình và luồng (Thread)', 'Điều độ CPU: FCFS, SJF, Round Robin', 'Đồng bộ hoá: Semaphore, Mutex, Deadlock', 'Quản lý bộ nhớ phân trang và phân đoạn', 'Hệ thống file và lập lịch đĩa']],
    ['IT4490', 'Thiết kế và xây dựng phần mềm', ['Đặc tả yêu cầu SRS và Use Case', 'Kiến trúc MVC, Layered, Microservices', 'Mẫu thiết kế (Design Patterns) GoF', 'Nguyên lý SOLID và Clean Code', 'Kiểm thử đơn vị và tích hợp']],
  ]],
  ['NEU', 'ĐH Kinh tế Quốc dân', 'st.neu.edu.vn', ['Kinh tế học', 'Tài chính – Ngân hàng', 'Kế toán – Kiểm toán', 'Quản trị kinh doanh', 'Thương mại điện tử'], [
    ['TOKT1101', 'Kinh tế lượng', ['Ước lượng bình phương nhỏ nhất OLS', 'Hệ số xác định R2 và kiểm định t, F', 'Đa cộng tuyến và nhân tử phóng đại phương sai VIF', 'Phương sai sai số thay đổi – kiểm định White', 'Tự tương quan và thống kê Durbin-Watson']],
    ['KHMA1101', 'Kinh tế vĩ mô', ['Đo lường GDP, CPI và lạm phát', 'Mô hình tổng cầu AD – tổng cung AS', 'Chính sách tài khoá và số nhân chi tiêu', 'Chính sách tiền tệ và mô hình IS-LM', 'Mô hình Mundell-Fleming nền kinh tế mở']],
    ['KHMI1101', 'Kinh tế vi mô', ['Cung cầu và độ co giãn theo giá', 'Lý thuyết lợi ích và lựa chọn người tiêu dùng', 'Hàm sản xuất, chi phí ngắn hạn và dài hạn', 'Cạnh tranh hoàn hảo và độc quyền', 'Cân bằng Nash trong độc quyền nhóm']],
    ['KTKT1101', 'Nguyên lý kế toán', ['Bảng cân đối kế toán và phương trình kế toán', 'Tài khoản chữ T và nguyên tắc ghi sổ kép', 'Kế toán mua hàng, bán hàng và xác định kết quả', 'Khấu hao tài sản cố định', 'Lập báo cáo kết quả hoạt động kinh doanh']],
    ['NHLT1107', 'Lý thuyết tài chính tiền tệ', ['Giá trị thời gian của tiền (PV, FV, NPV)', 'Thị trường tài chính và công cụ nợ/vốn', 'Ngân hàng thương mại và quá trình tạo tiền', 'Ngân hàng trung ương và cung ứng tiền tệ', 'Lãi suất và cấu trúc kỳ hạn']],
  ]],
  ['UET', 'ĐH Công nghệ – ĐHQGHN', 'vnu.edu.vn', ['Công nghệ thông tin', 'Hệ thống thông tin', 'Trí tuệ nhân tạo', 'Mạng và truyền thông', 'Kỹ thuật phần mềm'], [
    ['INT2210', 'Cấu trúc dữ liệu và giải thuật', ['Đệ quy và chia để trị', 'QuickSort, MergeSort, HeapSort', 'Cây đỏ-đen và hàng đợi ưu tiên', 'Quy hoạch động cơ bản', 'Thuật toán cây khung nhỏ nhất Kruskal, Prim']],
    ['INT2208', 'Công nghệ phần mềm', ['Quy trình Scrum và Agile', 'Phân tích yêu cầu chức năng và phi chức năng', 'Biểu đồ UML: Class, Sequence, Activity', 'Quản lý cấu hình với Git và CI/CD', 'Kiểm thử hộp đen và hộp trắng']],
    ['INT2211', 'Cơ sở dữ liệu', ['Mô hình thực thể liên kết ER', 'Đại số quan hệ và ngôn ngữ SQL', 'Phụ thuộc hàm và chuẩn hoá 1NF, 2NF, 3NF, BCNF', 'Chỉ mục B-Tree và tối ưu truy vấn', 'Giao dịch ACID và kiểm soát đồng thời']],
    ['INT3401', 'Trí tuệ nhân tạo', ['Tìm kiếm mù BFS, DFS, UCS', 'Tìm kiếm có thông tin A* và heuristic', 'Tìm kiếm đối kháng Minimax, cắt tỉa Alpha-Beta', 'Biểu diễn tri thức và suy diễn logic vị từ', 'Học máy cơ bản: Naïve Bayes, cây quyết định']],
    ['MAT1093', 'Đại số tuyến tính', ['Định thức và ma trận nghịch đảo', 'Hệ cơ sở và số chiều không gian con', 'Tích vô hướng và trực giao hoá Gram-Schmidt', 'Phân rã SVD và ứng dụng', 'Toán tử đối xứng']],
  ]],
  ['FTU', 'ĐH Ngoại thương', 'ftu.edu.vn', ['Kinh tế đối ngoại', 'Kinh doanh quốc tế', 'Tài chính quốc tế', 'Logistics & Chuỗi cung ứng', 'Tiếng Anh thương mại'], [
    ['TAN331', 'Tiếng Anh thương mại', ['Thuật ngữ hợp đồng ngoại thương', 'Thư tín thương mại: Inquiry, Offer, Order', 'Điều kiện thương mại quốc tế Incoterms 2020', 'Chứng từ vận tải Bill of Lading', 'Đàm phán và khiếu nại thương mại']],
    ['TMA302', 'Marketing quốc tế', ['Phân tích môi trường PESTEL quốc tế', 'Chiến lược STP và định vị toàn cầu', 'Thích nghi hoá vs chuẩn hoá sản phẩm', 'Chiến lược định giá xuất khẩu và chuyển giá', 'Kênh phân phối thâm nhập thị trường ngoại']],
    ['KDQ301', 'Giao dịch thương mại quốc tế', ['Các phương thức giao dịch trên thị trường thế giới', 'Điều kiện Incoterms nhóm E, F, C, D', 'Hợp đồng mua bán hàng hoá quốc tế CISG', 'Thanh toán quốc tế L/C, nhờ thu D/P, D/A', 'Bảo hiểm hàng hải và tổn thất chung']],
    ['TCQ305', 'Thanh toán quốc tế', ['Tỷ giá hối đoái và nghiệp vụ ngoại hối Spot, Forward', 'Phương thức chuyển tiền T/T', 'Phương thức tín dụng chứng từ L/C theo UCP 600', 'Bộ chứng từ thương mại: Invoice, Packing List, C/O', 'Rủi ro tỷ giá và công cụ phòng vệ']],
    ['LOG310', 'Quản trị chuỗi cung ứng', ['Mô hình SCOR và hiệu ứng Bullwhip', 'Dự báo nhu cầu và quản trị tồn kho EOQ, ROP', 'Quản trị kho bãi và vận tải đa phương thức', 'Thu mua chiến lược và đánh giá nhà cung cấp', 'Chỉ số KPI chuỗi cung ứng']],
  ]],
  ['UIT', 'ĐH Công nghệ Thông tin – ĐHQG TP.HCM', 'gm.uit.edu.vn', ['Kỹ thuật phần mềm', 'An toàn thông tin', 'Khoa học dữ liệu', 'Hệ thống thông tin'], [
    ['IT001', 'Nhập môn lập trình', ['Biến, kiểu dữ liệu và cấu trúc rẽ nhánh', 'Vòng lặp for, while và kỹ thuật đặt lính canh', 'Hàm, tham trị và tham chiếu', 'Mảng một chiều, hai chiều và chuỗi ký tự', 'Con trỏ và cấu trúc struct trong C/C++']],
    ['IT002', 'Lập trình hướng đối tượng', ['Đóng gói (Encapsulation) và lớp đối tượng', 'Kế thừa (Inheritance) đơn và đa cấp', 'Đa hình (Polymorphism) và hàm ảo', 'Nạp chồng toán tử trong C++', 'Lớp trừu tượng và mẫu hàm Template']],
    ['IT004', 'Cơ sở dữ liệu', ['Thiết kế lược đồ quan hệ từ ERD', 'Truy vấn lồng, gom nhóm GROUP BY – HAVING', 'Phép chia trong đại số quan hệ', 'Ràng buộc toàn vẹn và Trigger', 'Dạng chuẩn 3NF và bảo toàn phụ thuộc hàm']],
    ['IT005', 'Nhập môn mạng máy tính', ['Chia mạng con Subnetting VLSM và CIDR', 'Giao thức DHCP, NAT và ICMP', 'Cấu hình định tuyến tĩnh và RIP/OSPF', 'Phân tích gói tin với Wireshark', 'Bảo mật mạng cơ bản và tường lửa ACL']],
    ['IE103', 'Quản lý thông tin', ['Vòng đời dữ liệu trong doanh nghiệp', 'Kho dữ liệu Data Warehouse và quy trình ETL', 'Phân tích OLAP và mô hình Star Schema', 'An toàn, phân quyền và sao lưu dữ liệu', 'Chất lượng dữ liệu và quản trị danh mục']],
  ]],
  ['HCMUS', 'ĐH Khoa học Tự nhiên – ĐHQG TP.HCM', 'student.hcmus.edu.vn', ['Khoa học máy tính', 'Toán – Tin ứng dụng', 'Khoa học dữ liệu', 'Vật lý tin học'], [
    ['MTH00003', 'Vi tích phân 1B', ['Giới hạn dãy số và tiêu chuẩn hội tụ', 'Hàm liên tục và định lý giá trị trung gian', 'Đạo hàm, quy tắc L’Hospital và cực trị', 'Tích phân Riemann và tích phân suy rộng', 'Chuỗi số dương: tiêu chuẩn D’Alembert, Cauchy']],
    ['CSC10004', 'Cấu trúc dữ liệu và giải thuật', ['Phân tích độ phức tạp đệ quy bằng định lý Master', 'Cây cân bằng AVL và các phép xoay đơn/kép', 'Cây B-Tree trên bộ nhớ ngoài', 'Bảng băm dây chuyền và địa chỉ mở', 'Thuật toán đường đi ngắn nhất Bellman-Ford, Floyd']],
    ['CSC10006', 'Cơ sở dữ liệu', ['Ngôn ngữ đại số quan hệ và phép kết tự nhiên', 'Truy vấn SQL nâng cao và View', 'Bao đóng thuộc tính và tìm khoá tối tiểu', 'Tách lược đồ không mất thông tin', 'Khôi phục dữ liệu với nhật ký giao dịch']],
    ['CSC14003', 'Cơ sở trí tuệ nhân tạo', ['Không gian trạng thái và tìm kiếm A*', 'Trò chơi đối kháng và hàm lượng giá', 'Logic mệnh đề và hợp giải Robinson', 'Mạng Bayes và suy diễn xác suất', 'Học có giám sát: hồi quy tuyến tính và logistic']],
    ['MTH00040', 'Xác suất thống kê', ['Xác suất có điều kiện và công thức Bayes', 'Biến ngẫu nhiên rời rạc và liên tục', 'Phân phối chuẩn, Poisson, nhị thức', 'Ước lượng khoảng tin cậy cho kỳ vọng và tỷ lệ', 'Kiểm định giả thuyết thống kê z-test, t-test, Chi-square']],
  ]],
  ['HCMUT', 'ĐH Bách khoa – ĐHQG TP.HCM', 'hcmut.edu.vn', ['Khoa học & Kỹ thuật máy tính', 'Điện – Điện tử', 'Cơ khí', 'Kỹ thuật hoá học', 'Quản lý công nghiệp'], [
    ['MT1003', 'Giải tích 1', ['Hàm số sơ cấp và giới hạn', 'Ứng dụng đạo hàm khảo sát hàm số', 'Tích phân xác định tính diện tích, thể tích', 'Phương trình vi phân cấp 1 và cấp 2 hệ số hằng', 'Mô hình vi phân trong kỹ thuật']],
    ['MT1007', 'Đại số tuyến tính', ['Phép biến đổi sơ cấp trên dòng và hạng ma trận', 'Không gian Euclid và hình chiếu trực giao', 'Chéo hoá trực giao ma trận đối xứng', 'Ứng dụng chuỗi Markov và bình phương cực tiểu', 'Số phức và đa thức đặc trưng']],
    ['CO2003', 'Cấu trúc dữ liệu và giải thuật', ['Danh sách đặc và danh sách liên kết', 'Cây nhị phân, biểu thức tiền tố – hậu tố', 'Cây AVL, Splay tree và Heap', 'Thuật toán sắp xếp nội và sắp xếp ngoại', 'Đồ thị có hướng, sắp xếp topo']],
    ['CO2013', 'Hệ cơ sở dữ liệu', ['Mô hình EER (Enhanced ER) và ánh xạ quan hệ', 'Ràng buộc tham chiếu và thủ tục lưu trữ', 'Phụ thuộc hàm, phủ tối tiểu', 'Cấu trúc lưu trữ trang dữ liệu và chỉ mục', 'Khoá hai pha (2PL) và xử lý deadlock']],
    ['PH1003', 'Vật lý 1', ['Động học và động lực học chất điểm', 'Định luật bảo toàn động lượng và cơ năng', 'Chuyển động quay của vật rắn và mômen quán tính', 'Dao động cơ điều hoà, tắt dần, cưỡng bức', 'Nguyên lý nhiệt động lực học I và II']],
  ]],
  ['UEH', 'ĐH Kinh tế TP.HCM', 'st.ueh.edu.vn', ['Tài chính doanh nghiệp', 'Kế toán – Kiểm toán', 'Marketing', 'Kinh doanh quốc tế', 'Ngân hàng'], [
    ['FIN301', 'Tài chính doanh nghiệp', ['Chiết khấu dòng tiền và thẩm định dự án NPV, IRR', 'Chi phí sử dụng vốn bình quân gia quyền WACC', 'Cấu trúc vốn và định lý Modigliani – Miller', 'Chính sách cổ tức và giá trị doanh nghiệp', 'Quản trị vốn lưu động và chu kỳ tiền mặt']],
    ['ACC201', 'Kế toán tài chính 1', ['Kế toán tiền và các khoản phải thu dự phòng', 'Kế toán hàng tồn kho theo FIFO, bình quân gia quyền', 'Kế toán tài sản cố định hữu hình và vô hình', 'Kế toán nợ phải trả và vốn chủ sở hữu', 'Trình bày báo cáo tài chính theo VAS']],
    ['MKT201', 'Nguyên lý Marketing', ['Hành vi mua của người tiêu dùng và khách hàng tổ chức', 'Nghiên cứu thị trường và phân khúc STP', 'Chiến lược sản phẩm và chu kỳ sống PLC', 'Chiến lược giá và truyền thông tích hợp IMC', 'Quản trị kênh phân phối đa kênh']],
    ['STA202', 'Thống kê ứng dụng trong kinh doanh', ['Thống kê mô tả: trung bình, trung vị, độ lệch chuẩn', 'Chỉ số giá Laspeyres và Paasche', 'Phân tích phương sai ANOVA một nhân tố', 'Hồi quy tuyến tính đơn và bội trên dữ liệu kinh doanh', 'Chuỗi thời gian và dự báo xu thế mùa vụ']],
    ['LAW101', 'Pháp luật đại cương', ['Nguồn pháp luật và văn bản quy phạm pháp luật', 'Chủ thể pháp luật dân sự và hợp đồng dân sự', 'Loại hình doanh nghiệp theo Luật Doanh nghiệp', 'Hợp đồng lao động và bảo hiểm xã hội', 'Giải quyết tranh chấp thương mại và trọng tài']],
  ]],
  ['PTIT', 'Học viện Công nghệ Bưu chính Viễn thông', 'stu.ptit.edu.vn', ['Công nghệ thông tin', 'An toàn thông tin', 'Kỹ thuật điện tử viễn thông', 'Đa phương tiện'], [
    ['INT1154', 'Tin học cơ sở 2 (Ngôn ngữ C)', ['Cấu trúc chương trình C và nhập xuất chuẩn', 'Ước chung lớn nhất, số nguyên tố, số thuận nghịch', 'Xử lý mảng và ma trận nguyên', 'Xâu ký tự và các hàm trong string.h', 'Đọc ghi file văn bản và nhị phân']],
    ['INT1306', 'Cấu trúc dữ liệu và giải thuật', ['Quay lui (Backtracking) sinh hoán vị, tổ hợp', 'Chia để trị và lũy thừa nhị phân', 'Quy hoạch động: dãy con tăng, cái túi', 'Ngăn xếp kiểm tra dấu ngoặc và tính biểu thức', 'Duyệt đồ thị tìm thành phần liên thông']],
    ['INT1332', 'Lập trình hướng đối tượng (Java)', ['Lớp, đối tượng, constructor và từ khoá static', 'Kế thừa, interface và lớp trừu tượng trong Java', 'Xử lý ngoại lệ try-catch-finally', 'Java Collections: ArrayList, HashMap, TreeSet', 'Đọc ghi luồng I/O và tuần tự hoá Object']],
    ['INT1336', 'Mạng máy tính', ['Mô hình phân tầng và đóng gói dữ liệu', 'Địa chỉ IPv4/IPv6 và chia mạng con', 'Giao thức TCP bắt tay 3 bước và cửa sổ trượt', 'Định tuyến động trạng thái liên kết và vector khoảng cách', 'Dịch vụ DNS, Web, Email và FTP']],
    ['INT1414', 'An toàn và bảo mật hệ thống thông tin', ['Mã hoá đối xứng DES, AES và chế độ hoạt động', 'Mã hoá bất đối xứng RSA và trao đổi khoá Diffie-Hellman', 'Hàm băm mật mã SHA và chữ ký số', 'Xác thực đa nhân tố và kiểm soát truy cập RBAC', 'ỗ hổng OWASP Top 10: SQLi, XSS, CSRF']],
  ]],
  ['HANU', 'ĐH Hà Nội', 's.hanu.edu.vn', ['Ngôn ngữ Anh', 'Ngôn ngữ Trung', 'Quản trị kinh doanh (dạy bằng tiếng Anh)', 'Công nghệ thông tin (dạy bằng tiếng Anh)'], [
    ['ENG201', 'Academic Writing', ['Cấu trúc đoạn văn học thuật Topic Sentence – Supporting', 'Paraphrasing, Summarizing và trích dẫn APA', 'Bài luận Argumentative và Counter-argument', 'Bài luận Cause-Effect và Compare-Contrast', 'Liên kết mạch lạc Cohesion & Coherence']],
    ['ENG305', 'Translation Theory & Practice', ['Tương đương dịch thuật và chuyển dịch ngữ nghĩa', 'Xử lý thuật ngữ kinh tế – tài chính Anh – Việt', 'Dịch câu phức, mệnh đề quan hệ và thể bị động', 'Phiên dịch ghi tốc ký (Note-taking) cơ bản', 'Hiệu đính bản dịch chuyên ngành']],
    ['IBA204', 'Principles of Management', ['Bốn chức năng quản trị: Planning, Organizing, Leading, Controlling', 'Ma trận SWOT và hoạch định chiến lược', 'Cơ cấu tổ chức và tầm hạn quản trị', 'Các học thuyết tạo động lực Maslow, Herzberg', 'Kiểm soát quản trị và thẻ điểm cân bằng BSC']],
    ['FIN210', 'Corporate Finance (English)', ['Time Value of Money and Annuity Valuation', 'Bond and Stock Valuation Models', 'Capital Budgeting: NPV, IRR, Payback Period', 'CAPM, Beta and Cost of Capital', 'Working Capital Management']],
    ['CHN202', 'Ngữ pháp tiếng Trung trung cấp', ['Bổ ngữ kết quả, bổ ngữ xu hướng và bổ ngữ khả năng', 'Câu chữ 把 (Bǎ) và câu bị động chữ 被 (Bèi)', 'Phó từ liên kết và cấu trúc câu phức', 'Lượng từ và đại từ nghi vấn phiếm chỉ', 'Kỹ năng đọc hiểu và viết đoạn văn HSK 4–5']],
  ]],
  ['DAV', 'Học viện Ngoại giao', 'dav.edu.vn', ['Quan hệ quốc tế', 'Luật quốc tế', 'Kinh tế quốc tế', 'Truyền thông quốc tế'], [
    ['IR201', 'Lý thuyết quan hệ quốc tế', ['Chủ nghĩa hiện thực cổ điển và tân hiện thực', 'Chủ nghĩa tự do và thể chế quốc tế', 'Chủ nghĩa kiến tạo (Constructivism)', 'Cân bằng quyền lực và lưỡng nan an ninh', 'Phân tích chính sách đối ngoại các nước lớn']],
    ['IL301', 'Công pháp quốc tế', ['Nguồn của luật quốc tế: điều ước và tập quán', 'Chủ thể luật quốc tế và công nhận quốc gia', 'Luật biển quốc tế UNCLOS 1982', 'Trách nhiệm pháp lý quốc tế và ngoại giao lãnh sự', 'Giải quyết hoà bình các tranh chấp quốc tế']],
    ['IE205', 'Kinh tế quốc tế', ['Lợi thế tuyệt đối Adam Smith và lợi thế so sánh Ricardo', 'Mô hình Heckscher-Ohlin về thương mại quốc tế', 'Thuế quan, hạn ngạch và hàng rào phi thuế quan', 'Tổ chức Thương mại Thế giới WTO và các hiệp định FTA', 'Cán cân thanh toán quốc tế BOP']],
    ['IC210', 'Truyền thông đối ngoại', ['Ngoại giao công chúng và sức mạnh mềm (Soft Power)', 'Xây dựng thông điệp và quản trị khủng hoảng truyền thông', 'Quan hệ báo chí quốc tế và họp báo', 'Truyền thông số trong chiến dịch đối ngoại', 'Phân tích dư luận và đánh giá hiệu quả chiến dịch']],
    ['ENG220', 'Tiếng Anh chuyên ngành Quan hệ quốc tế', ['Thuật ngữ ngoại giao đa phương và nghị quyết LHQ', 'Ngôn ngữ tuyên bố chung và thông cáo báo chí', 'Soạn thảo công hàm ngoại giao (Note Verbale)', 'Đọc hiểu bình luận địa chính trị quốc tế', 'Kỹ năng tranh biện mô phỏng Liên Hợp Quốc (MUN)']],
  ]],
  ['TMU', 'ĐH Thương mại', 'tmu.edu.vn', ['Thương mại điện tử', 'Quản trị thương hiệu', 'Kế toán – Kiểm toán', 'Quản trị nhân lực', 'Hệ thống thông tin quản lý'], [
    ['ECOM301', 'Thương mại điện tử căn bản', ['Các mô hình B2B, B2C, C2C, O2O', 'Hạ tầng kỹ thuật và sàn giao dịch điện tử', 'Thanh toán điện tử, ví số và cổng thanh toán', 'An toàn giao dịch và chữ ký số trong TMĐT', 'Khung pháp lý về giao dịch điện tử tại Việt Nam']],
    ['DMKT305', 'Digital Marketing', ['Hành trình khách hàng số và phễu chuyển đổi AARRR', 'Tối ưu hoá công cụ tìm kiếm SEO Onpage/Offpage', 'Quảng cáo tìm kiếm SEM và tối ưu điểm chất lượng', 'Đo lường chỉ số CPC, CPM, CPA, ROAS, LTV/CAC', 'Tiếp thị nội dung và tự động hoá Email Marketing']],
    ['HRM202', 'Quản trị nhân lực', ['Phân tích công việc: bản mô tả và tiêu chuẩn công việc', 'Quy trình tuyển dụng và phỏng vấn theo năng lực STAR', 'Đào tạo phát triển theo mô hình 70-20-10', 'Đánh giá thành tích KPI, OKR và khung năng lực', 'Hệ thống đãi ngộ 3P (Pay for Position, Person, Performance)']],
    ['MIS304', 'Hệ thống thông tin quản lý', ['Các hệ thống TPS, MIS, DSS, ERP trong doanh nghiệp', 'Quy trình nghiệp vụ BPMN và tái cấu trúc quy trình', 'Triển khai hệ thống hoạch định nguồn lực ERP', 'Hệ thống quản trị quan hệ khách hàng CRM', 'Đánh giá hiệu quả đầu tư CNTT và quản trị rủi ro']],
    ['AUD310', 'Kiểm toán căn bản', ['Khái niệm gian lận, sai sót và mức trọng yếu', 'Rủi ro kiểm toán: rủi ro tiềm tàng, kiểm soát, phát hiện', 'Bằng chứng kiểm toán và hồ sơ kiểm toán', 'Thủ tục kiểm soát nội bộ theo khuôn mẫu COSO', 'Các loại ý kiến kiểm toán trên báo cáo kiểm toán']],
  ]],
];

const KEYWORDS = [
  ['lưu hành nội bộ', 'Tài liệu nội bộ của trường/giảng viên'],
  ['nhà xuất bản', 'Dấu hiệu sách xuất bản'],
  ['nxb giáo dục', 'Sách giáo khoa NXB'],
  ['isbn', 'Mã sách xuất bản'],
  ['all rights reserved', 'Tài liệu giữ bản quyền'],
  ['bản quyền thuộc về', 'Tài liệu giữ bản quyền'],
  ['cấm sao chép', 'Tài liệu giữ bản quyền'],
  ['giáo trình chính thức', 'Giáo trình chính thức'],
];

const LAST_NAMES = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý', 'Đinh', 'Trương', 'Đoàn', 'Lương'];
const MID_NAMES = ['Văn', 'Thị', 'Minh', 'Hoàng', 'Đức', 'Thanh', 'Quốc', 'Gia', 'Ngọc', 'Hữu', 'Tuấn', 'Phương', 'Anh', 'Khánh', 'Hải', 'Xuân', 'Bảo', 'Nhật', 'Thuỳ', 'Đình'];
const FIRST_NAMES = ['An', 'Bình', 'Chi', 'Dũng', 'Đạt', 'Giang', 'Hà', 'Hải', 'Hiếu', 'Hoà', 'Hùng', 'Hương', 'Huyền', 'Khánh', 'Khoa', 'Khôi', 'Kiên', 'Lâm', 'Lan', 'Linh', 'Long', 'Mai', 'Minh', 'My', 'Nam', 'Nga', 'Ngân', 'Ngọc', 'Nhung', 'Oanh', 'Phát', 'Phong', 'Phúc', 'Phương', 'Quân', 'Quang', 'Quỳnh', 'Sơn', 'Tâm', 'Tân', 'Thắng', 'Thanh', 'Thảo', 'Thịnh', 'Thư', 'Thương', 'Tiến', 'Trang', 'Trí', 'Trinh', 'Trung', 'Trường', 'Tú', 'Tuấn', 'Tùng', 'Uyên', 'Vân', 'Việt', 'Vinh', 'Vy', 'Yến'];

const SEMESTERS = ['20241', '20242', '20251', '20252', '20261', 'HK1 2024-2025', 'HK2 2024-2025', 'HK1 2025-2026'];

const REVIEW_COMMENTS = [
  'Tài liệu cô đọng, bám sát nội dung thi cuối kỳ. Đọc 2 tối là nắm được khung chính.',
  'Phần phân tích lỗi sai rất thực tế, mình đi thi gặp đúng dạng câu 2 và câu 4.',
  'Trình bày rõ ràng, công thức kèm ví dụ tính tay từng bước nên dễ theo dõi.',
  'Đáng tiền, tiết kiệm được rất nhiều thời gian tự tổng hợp lại từ đầu.',
  'Sơ đồ hệ thống hoá mạch lạc, phù hợp để ôn nước rút trước ngày thi.',
  'Bài giải giải thích kỹ tại sao chọn hướng biến đổi đó chứ không chỉ ghi đáp số.',
  'Dùng tài liệu này kết hợp tạo Flashcard học trong 1 tuần nhớ rất lâu.',
  'Nội dung đúng trọng tâm đề cương của bộ môn, cảm ơn tác giả đã chia sẻ.',
  'Phần câu hỏi ôn tập sát với cấu trúc đề 90 phút gần đây.',
  'Code mẫu chạy chuẩn, có chú thích độ phức tạp và các trường hợp biên.',
];

// PRNG tất định để dữ liệu sinh ra ổn định
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDocText(course, schoolCode, type, sem, idx) {
  const [code, name, topics] = course;
  const t0 = topics[idx % topics.length];
  const t1 = topics[(idx + 1) % topics.length];
  const t2 = topics[(idx + 2) % topics.length];
  const t3 = topics[(idx + 3) % topics.length];

  const templates = {
    study_guide: {
      title: `Đề cương ôn tập ${name} (${code}) – ${t0} [${sem}]`,
      desc: `Bản hệ thống hoá trọng tâm học phần ${name} tại ${schoolCode}, tập trung vào ${t0.toLowerCase()} và ${t1.toLowerCase()}, tự biên soạn lại theo từng dạng bài.`,
      body: `# Đề cương tự biên soạn: ${name} (${code} – ${schoolCode})

## 1. Tóm tắt kiến thức cốt lõi
- ${t0}: nắm vững định nghĩa, điều kiện áp dụng và các giả thiết nền tảng trước khi biến đổi công thức.
- ${t1}: phân biệt trường hợp tổng quát và trường hợp suy biến thường xuất hiện trong câu hỏi phân loại.
- ${t2}: quy trình giải 4 bước chuẩn để không bị trừ điểm trình bày trong bài thi tự luận.
- ${t3}: mối liên hệ với các chương trước và cách kiểm tra nhanh kết quả bằng nghiệm đặc biệt.

## 2. Phương pháp làm bài theo dạng
1. **Dạng 1 – Nhận diện và thiết lập mô hình (${t0}):** đọc kỹ giả thiết, gạch chân các đại lượng đã cho và điều kiện ràng buộc.
2. **Dạng 2 – Tính toán và biến đổi (${t1}):** viết rõ công thức gốc trước khi thay số; kiểm tra thứ nguyên và dấu của biểu thức.
3. **Dạng 3 – Câu hỏi vận dụng cao (${t2}):** kết hợp bổ đề phụ hoặc chia trường hợp biên để xử lý triệt để.

## 3. Lỗi sai sinh viên thường gặp
> Rất nhiều bài thi mất 0.5–1.0 điểm ở bước kết luận do quên đối chiếu điều kiện xác định ban đầu của bài toán ${code}.`,
    },
    cheat_sheet: {
      title: `Cheat sheet công thức & thuật ngữ ${code} – ${name} (${sem})`,
      desc: `Bảng tóm tắt 2 trang các định nghĩa, công thức giải nhanh và bảng tra cứu cho môn ${name} (${schoolCode}).`,
      body: `# Cheat Sheet ${code} – ${name} (${schoolCode})

## Thuật ngữ & định nghĩa nhanh
- ${t0}: khái niệm nền tảng mở đầu học phần ${code}, dùng làm cơ sở suy diễn cho các bài toán sau.
- ${t1}: công cụ trọng tâm chiếm khoảng 30–40% điểm số trong đề thi kết thúc học phần.
- ${t2}: kỹ thuật biến đổi giúp rút gọn khối lượng tính toán trong điều kiện phòng thi giới hạn thời gian.
- ${t3}: tiêu chuẩn kiểm tra tính đúng đắn và độ ổn định của lời giải.

## Quy tắc nhớ nhanh trước giờ thi
1. Kiểm tra điều kiện cần trước, điều kiện đủ sau.
2. Với bài trắc nghiệm: thử với trường hợp kích thước nhỏ hoặc giá trị biên để loại trừ phương án nhiễu.
3. Với bài tự luận: luôn ghi rõ tên định lý/tiêu chuẩn sử dụng ở mỗi bước suy luận.`,
    },
    solution: {
      title: `Lời giải chi tiết đề ôn ${name} (${code}) kỳ ${sem} – phần ${t1}`,
      desc: `Bài giải từng bước kèm thang điểm dự kiến và lưu ý tránh mất điểm cho học phần ${name} (${schoolCode}).`,
      body: `# Lời giải chi tiết ${code} – ${name} (kỳ ${sem})

## Câu 1 (2.5 điểm): ${t0}
- **Phân tích:** Bài toán thuộc dạng cơ bản của chương ${t0.toLowerCase()}.
- **Cách trình bày:** Xác định đầy đủ các thành phần đầu vào, áp dụng trực tiếp định lý chuẩn và kết luận ngắn gọn.
- **Điểm hay mất:** Thiếu bước kiểm tra điều kiện tại biên (trừ 0.25đ).

## Câu 2 (3.0 điểm): ${t1}
- **Phân tích:** Cần biến đổi tương đương đưa về dạng chính tắc trước khi tính toán.
- **Lời giải tóm tắt:** Thiết lập biểu thức trung gian, rút gọn theo quy tắc chuẩn và đối chiếu với miền giá trị hợp lệ.

## Câu 3 (2.5 điểm): ${t2}
- **Phân tích:** Câu hỏi kết hợp lý thuyết và vận dụng thực hành.
- **Nhận xét:** Nên vẽ sơ đồ/bảng phụ ở giấy nháp để tránh nhầm chỉ số ở bước thế ngược.

## Câu 4 (2.0 điểm): Câu phân loại – ${t3}
- **Hướng tiếp cận:** Đánh giá chặn trên/chặn dưới hoặc xét bất biến để chứng minh tính chất yêu cầu.`,
    },
    exam_questions: {
      title: `Bộ câu hỏi ôn tập & đề luyện ${code} – ${name} (${sem})`,
      desc: `Tổng hợp câu hỏi tự luyện theo cấu trúc đề thi ${schoolCode}, bao quát ${t0.toLowerCase()} và ${t2.toLowerCase()}.`,
      body: `# Bộ câu hỏi ôn tập ${code} – ${name} (${schoolCode})

## Phần I – Câu hỏi lý thuyết & khái niệm
1. Trình bày bản chất và điều kiện áp dụng của **${t0}** trong học phần ${name}.
2. So sánh ưu, nhược điểm giữa phương pháp giải dựa trên **${t1}** và **${t2}**.
3. Khi nào giả thiết của **${t3}** bị vi phạm và cách khắc phục trong thực tế?

## Phần II – Bài tập tự luyện theo mức độ
- **Mức cơ bản:** Áp dụng trực tiếp quy trình chuẩn cho bộ số liệu/tham số nhỏ để rèn tốc độ tính toán.
- **Mức trung bình:** Bài toán có tham số $m$ hoặc yêu cầu biện luận theo điều kiện ràng buộc.
- **Mức nâng cao:** Bài toán tổng hợp nhiều chương, yêu cầu giải thích ý nghĩa thực tiễn của kết quả.`,
    },
    mindmap: {
      title: `Sơ đồ tư duy hệ thống hoá ${name} (${code}) – trọng tâm ${t2}`,
      desc: `Cấu trúc phân nhánh toàn bộ chương trình ${code} tại ${schoolCode}, thuận tiện ôn tổng kết cuối kỳ.`,
      body: `# Sơ đồ cấu trúc kiến thức ${code} – ${name}

## Nhánh 1: Nền tảng (${t0})
- Định nghĩa cốt lõi và ký hiệu chuẩn dùng xuyên suốt học phần.
- Các tính chất bất biến cần nhớ.

## Nhánh 2: Công cụ phân tích (${t1})
- Quy trình áp dụng từng bước từ dữ liệu đầu vào đến kết luận.
- Các trường hợp đặc biệt cần kiểm tra riêng.

## Nhánh 3: Ứng dụng & tối ưu (${t2} – ${t3})
- Liên hệ giữa mô hình lý thuyết và bài toán thực tế của ngành.
- Danh sách câu hỏi phản biện thường gặp khi vấn đáp hoặc làm bài tự luận.`,
    },
    report: {
      title: `Báo cáo mẫu / Tiểu luận ${name} (${code}) – chủ đề ${t0}`,
      desc: `Khung cấu trúc báo cáo bài tập lớn môn ${name} (${schoolCode}), đạt điểm A, gồm đặt vấn đề, phương pháp và kết quả.`,
      body: `# Khung báo cáo bài tập lớn ${code} – ${name}

## 1. Đặt vấn đề & mục tiêu
- Bối cảnh bài toán liên quan đến **${t0}** trong học phần ${name}.
- Mục tiêu cụ thể, phạm vi dữ liệu/mô hình và tiêu chí đánh giá kết quả.

## 2. Cơ sở lý thuyết
- Trình bày ngắn gọn nền tảng **${t1}** và **${t2}** (không chép nguyên văn giáo trình, chỉ nêu công thức/mô hình thực sự sử dụng).

## 3. Thực nghiệm & phân tích kết quả
- Thiết lập kịch bản kiểm nghiệm, bảng biểu tổng hợp và thảo luận nguyên nhân sai số theo **${t3}**.`,
    },
    source_code: {
      title: `Bài tập thực hành & minh hoạ cài đặt ${code} – ${t1}`,
      desc: `Mã nguồn minh hoạ kèm giải thích từng hàm cho nội dung ${t1.toLowerCase()} trong học phần ${name} (${schoolCode}).`,
      body: `# Minh hoạ cài đặt: ${t1} (${code})

## Mô tả thuật toán / quy trình
- Đầu vào: bộ dữ liệu đã chuẩn hoá theo yêu cầu của bài toán ${name}.
- Đầu ra: kết quả tính toán kèm thông tin kiểm chứng độ chính xác.

\`\`\`
// Minh hoa khung xu ly cho hoc phan ${code}
function solve_${code.toLowerCase()}(input) {
  const n = input.length;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    acc += input[i] * (i + 1);
  }
  return { count: n, score: acc };
}
\`\`\`

## Lưu ý khi kiểm thử
- Luôn kiểm thử với bộ dữ liệu rỗng, bộ dữ liệu 1 phần tử và bộ dữ liệu kích thước lớn.`,
    },
    experience: {
      title: `Kinh nghiệm ôn và làm bài thi ${name} (${code} – ${schoolCode}) kỳ ${sem}`,
      desc: `Chia sẻ cách phân bổ thời gian trong phòng thi, nguồn bài tập tự luyện và các bẫy hay gặp ở môn ${code}.`,
      body: `# Kinh nghiệm học & thi ${name} (${code} – ${schoolCode})

## Cấu trúc đề và phân bổ thời gian
- Nên dành 5 phút đầu đọc lướt toàn bộ đề, đánh dấu các câu thuộc phần **${t0}** và **${t1}** để làm trước lấy điểm chắc chắn.
- Không sa đà quá 20 phút vào câu phân loại (**${t3}**) khi chưa hoàn thành các câu cơ bản.

## Lộ trình ôn tập 2 tuần trước kỳ thi
1. **Ngày 1–5:** Hệ thống lại lý thuyết và tự viết lại bảng công thức của **${t0}**, **${t1}**.
2. **Ngày 6–10:** Giải trọn vẹn các bài tập tự luyện phần **${t2}** và ghi lại sổ tay lỗi sai.
3. **Ngày 11–14:** Bấm giờ làm đề tổng hợp như thi thật.`,
    },
  };
  return templates[type] || templates.study_guide;
}

async function ensureDefaults({ demo = process.env.NO_DEMO !== '1' } = {}) {
  const scale = process.env.SEED_SCALE || 'full'; // 'full' (~750 users, ~1800 docs)
  if (!db.get('SELECT id FROM schools LIMIT 1')) {
    db.tx(() => {
      for (const [code, name, , , courses] of SCHOOLS) {
        const sid = db.run('INSERT INTO schools (code, name) VALUES (?, ?)', [code, name]).lastInsertRowid;
        for (const [cc, cn] of courses) db.run('INSERT INTO courses (school_id, code, name) VALUES (?, ?, ?)', [sid, cc, cn]);
      }
      for (const [k, note] of KEYWORDS) db.run("INSERT OR IGNORE INTO blacklist (type, value, note) VALUES ('keyword', ?, ?)", [k, note]);
    });
  }
  if (!db.get("SELECT id FROM users WHERE role = 'admin' LIMIT 1")) {
    const hash = await bcrypt.hash('admin123', 8);
    db.run("INSERT INTO users (email, password_hash, name, role) VALUES ('admin@unishare.vn', ?, 'Quản trị viên', 'admin')", [hash]);
    console.log('👤 Đã tạo tài khoản admin: admin@unishare.vn / admin123');
  }
  if (demo && !db.get("SELECT id FROM users WHERE role = 'user' LIMIT 1")) {
    await seedDataset(scale);
  }
  db.saveNow();
}

const sid = (code) => db.get('SELECT id FROM schools WHERE code = ?', [code]).id;
const cid = (school, code) => db.get('SELECT id FROM courses WHERE school_id = ? AND code = ?', [sid(school), code]).id;

async function seedDataset(scale = 'full') {
  const t0 = Date.now();
  const rand = mulberry32(20261022);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const rInt = (min, max) => min + Math.floor(rand() * (max - min + 1));

  const targetUsers = scale === 'mini' ? 30 : 750;
  const targetDocs = scale === 'mini' ? 60 : 1800;

  const userHash = await bcrypt.hash('123456', 8);
  const now = sqlNow();
  const premiumFuture = sqlNow(150 * 24 * 3600 * 1000);

  const schoolMeta = SCHOOLS.map(([code, name, domain, majors, courses]) => {
    const schoolId = sid(code);
    const courseRows = courses.map((c) => ({
      id: cid(code, c[0]),
      code: c[0],
      name: c[1],
      topics: c[2],
      raw: c,
    }));
    return { id: schoolId, code, name, domain, majors, courses: courseRows };
  });

  db.tx(() => {
    // 1. Tạo 3 tài khoản cố định để đăng nhập demo & chạy kiểm thử
    const an = db.run(
      'INSERT INTO users (email, password_hash, name, school_id, major, balance, points, premium_until, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['an@student.vn', userHash, 'Nguyễn Văn An', sid('HUST'), 'Khoa học máy tính', 500000, 20, premiumFuture, 'Sinh viên K66 KHMT – Bách khoa Hà Nội, trợ giảng môn CTDL&GT.']
    ).lastInsertRowid;
    const binh = db.run(
      'INSERT INTO users (email, password_hash, name, school_id, major, balance, points, premium_until, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['binh@student.vn', userHash, 'Trần Thị Bình', sid('NEU'), 'Kinh tế học', 200000, 5, null, 'Sinh viên Viện Kinh tế học – ĐH Kinh tế Quốc dân.']
    ).lastInsertRowid;
    const chi = db.run(
      'INSERT INTO users (email, password_hash, name, school_id, major, balance, points, premium_until, bio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      ['chi@student.vn', userHash, 'Lê Minh Chi', sid('UET'), 'Kỹ thuật phần mềm', 100000, 5, null, 'Sinh viên K67 ĐH Công nghệ – ĐHQGHN.']
    ).lastInsertRowid;

    // 2. Tạo 5 tài liệu cốt lõi ở ID 1..5 (giữ tương thích hoàn toàn với kiểm thử)
    const coreDocs = [
      [an, 'HUST', 'IT3011', 'Cheat sheet Cấu trúc dữ liệu & Giải thuật – ôn thi cuối kỳ', 'Tóm tắt độ phức tạp, đặc điểm các cấu trúc dữ liệu và thuật toán sắp xếp, tự tổng hợp sau 2 kỳ làm trợ giảng.', 'cheat_sheet', 0, `# Cheat sheet CTDL & GT (tự biên soạn)

## Khái niệm cốt lõi
- Độ phức tạp thời gian: số bước tính toán của thuật toán theo kích thước đầu vào n
- Ngăn xếp (Stack): cấu trúc LIFO, thao tác push/pop đều O(1)
- Hàng đợi (Queue): cấu trúc FIFO, enqueue/dequeue O(1)
- Cây nhị phân tìm kiếm: cây mà nút trái nhỏ hơn gốc và nút phải lớn hơn gốc
- Bảng băm: ánh xạ khoá sang chỉ số mảng, tra cứu trung bình O(1)
- Heap: cây nhị phân đầy đủ thoả tính chất đống, lấy min/max O(1)

## Thuật toán sắp xếp
1. Quick sort: trung bình O(n log n), xấu nhất O(n^2), không ổn định
2. Merge sort: luôn O(n log n), ổn định, tốn O(n) bộ nhớ phụ
3. Heap sort: O(n log n), tại chỗ, không ổn định

## Đồ thị
- BFS: duyệt theo chiều rộng, dùng hàng đợi, tìm đường đi ngắn nhất trên đồ thị không trọng số
- DFS: duyệt theo chiều sâu, dùng ngăn xếp hoặc đệ quy
- Dijkstra: tìm đường đi ngắn nhất với trọng số không âm, O((V+E) log V) dùng heap

\`\`\`
function binarySearch(a, x) {
  let l = 0, r = a.length - 1;
  while (l <= r) {
    const m = (l + r) >> 1;
    if (a[m] === x) return m;
    a[m] < x ? (l = m + 1) : (r = m - 1);
  }
  return -1;
}
\`\`\`
`],
      [an, 'HUST', 'MI1111', 'Lời giải chi tiết đề thi Giải tích I – kỳ 20241 (tự giải)', 'Bài giải từng bước + phân tích lỗi sai hay gặp, do mình (điểm A+) tự viết từ đề thi công khai sau kỳ thi.', 'solution', 39000, `# Lời giải chi tiết – Giải tích I

## Câu 1: Tính giới hạn lim (sin x - x)/x^3 khi x → 0
Áp dụng khai triển Maclaurin: sin x = x - x^3/6 + o(x^3).
Do đó (sin x - x)/x^3 = (-x^3/6 + o(x^3))/x^3 → **-1/6**.

## Câu 2: Xét tính liên tục của f(x) = x·sin(1/x), f(0) = 0
Vì |x·sin(1/x)| ≤ |x| → 0 nên f liên tục tại 0 theo định lý kẹp.

## Câu 3: Tính tích phân ∫ x·e^x dx
Tích phân từng phần: u = x, dv = e^x dx ⇒ kết quả x·e^x - e^x + C.

## Tổng kết kinh nghiệm
- Định lý kẹp: dùng khi hàm bị chặn nhân với hàm tiến về 0
- Khai triển Maclaurin: công cụ mạnh cho giới hạn dạng 0/0 bậc cao
- Tích phân từng phần: chọn u theo thứ tự ưu tiên LIATE
`],
      [binh, 'NEU', 'TOKT1101', 'Đề cương ôn tập Kinh tế lượng – tóm tắt mô hình OLS & kiểm định', 'Đề cương tự soạn theo cấu trúc riêng, kèm công thức và các bước kiểm định khuyết tật mô hình.', 'study_guide', 0, `# Đề cương Kinh tế lượng (bản tự soạn)

## 1. Mô hình hồi quy tuyến tính
- Hồi quy OLS: phương pháp ước lượng tối thiểu hoá tổng bình phương phần dư
- R bình phương: tỉ lệ biến động của Y được giải thích bởi mô hình
- Hệ số chặn: giá trị trung bình của Y khi các biến độc lập bằng 0

## 2. Các khuyết tật của mô hình
- Đa cộng tuyến: các biến độc lập có tương quan tuyến tính mạnh với nhau
- Phương sai sai số thay đổi: phương sai của nhiễu không đồng đều, kiểm định bằng White test
- Tự tương quan: các sai số ngẫu nhiên có tương quan, kiểm định bằng Durbin-Watson
`],
      [chi, 'UET', 'INT2208', 'Mẫu tài liệu SRS & BRD – đồ án Công nghệ phần mềm (tự viết)', 'Cấu trúc đặc tả yêu cầu phần mềm từ đồ án nhóm đạt 9.5, dùng làm khung tham khảo cho bài tập lớn.', 'report', 25000, `# Mẫu đặc tả SRS (đồ án tự thực hiện)

## 1. Giới thiệu
- Mục đích: mô tả đầy đủ yêu cầu của hệ thống quản lý thư viện số
- Phạm vi: phân hệ mượn trả, phân hệ tìm kiếm, phân hệ báo cáo

## 2. Thuật ngữ
- BRD: tài liệu yêu cầu nghiệp vụ, mô tả nhu cầu của doanh nghiệp
- SRS: tài liệu đặc tả yêu cầu phần mềm cho đội phát triển
- Use case: kịch bản tương tác giữa tác nhân và hệ thống
`],
      [chi, 'UET', 'INT2210', 'Kinh nghiệm thi cuối kỳ CTDL&GT UET – phân bổ 90 phút', 'Chia sẻ cấu trúc đề, cách phân bổ thời gian và các dạng bài cây AVL, bảng băm, đồ thị hay gặp.', 'experience', 0, `# Kinh nghiệm thi CTDL&GT

- Đề gồm 2 phần: trắc nghiệm 30% và tự luận cài đặt thuật toán 70%
- Thời gian: 90 phút, nên dành 20 phút đầu cho trắc nghiệm
- Dạng bài hay gặp: cây AVL, bảng băm, đồ thị BFS/DFS
`],
    ];

    const docIds = [];
    for (const [uid, sc, cc, title, desc, type, price, content] of coreDocs) {
      docIds.push(
        db.run(
          `INSERT INTO documents (user_id, school_id, course_id, title, description, doc_type, content, price, status, moderation_notes,
             copyright_agreed_at, agreement_ip, points_awarded, views, downloads, rating_avg, rating_count)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved', 'Vượt qua kiểm duyệt tự động.', ?, '127.0.0.1', 1, ?, ?, 0, 0)`,
          [uid, sid(sc), cid(sc, cc), title, desc, type, content, price, now, rInt(180, 950), rInt(30, 210)]
        ).lastInsertRowid
      );
    }

    // 3. Sinh thêm sinh viên đến đủ quy mô (tổng 750 sinh viên)
    const userIds = [an, binh, chi];
    const userSchool = { [an]: schoolMeta[0], [binh]: schoolMeta[1], [chi]: schoolMeta[2] };

    for (let i = 4; i <= targetUsers; i++) {
      const sm = schoolMeta[(i - 1) % schoolMeta.length];
      const ln = pick(LAST_NAMES);
      const mn = pick(MID_NAMES);
      const fn = pick(FIRST_NAMES);
      const fullName = `${ln} ${mn} ${fn}`;
      const slug = stripDiacritics(`${fn}.${ln.charAt(0)}${mn.charAt(0)}`).toLowerCase().replace(/[^a-z]/g, '');
      const cohort = rInt(20, 24);
      const email = `${slug}${cohort}${String(i).padStart(4, '0')}@${sm.domain}`;
      const major = pick(sm.majors);
      const isPrem = rand() < 0.17;
      const balance = pick([0, 15000, 35000, 50000, 85000, 120000, 200000, 350000, 500000]);
      const points = rInt(2, 45);
      const daysAgo = rInt(5, 320);
      const createdAt = sqlNow(-daysAgo * 86400 * 1000);
      const premUntil = isPrem ? sqlNow(rInt(15, 160) * 86400 * 1000) : null;
      const bio = `Sinh viên ngành ${major} – ${sm.name} (K${cohort}).`;

      const uid = db.run(
        `INSERT INTO users (email, password_hash, name, school_id, major, bio, points, balance, premium_until, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [email, userHash, fullName, sm.id, major, bio, points, balance, premUntil, createdAt]
      ).lastInsertRowid;
      userIds.push(uid);
      userSchool[uid] = sm;

      if (isPrem) {
        const plan = pick([config.PREMIUM_PLANS.month, config.PREMIUM_PLANS.semester]);
        db.run("INSERT INTO revenue (source, amount, ref, created_at) VALUES ('premium', ?, ?, ?)", [plan.price, 'user#' + uid, createdAt]);
      }
    }

    // 4. Sinh ~1.800 tài liệu học tập trải đều qua 12 trường & 60 môn học
    const docTypes = ['study_guide', 'cheat_sheet', 'solution', 'exam_questions', 'mindmap', 'report', 'source_code', 'experience'];
    const prices = [0, 0, 0, 0, 0, 15000, 20000, 25000, 30000, 39000, 45000, 50000, 69000, 89000];
    const docMeta = docIds.map((id, idx) => ({ id, userId: coreDocs[idx][0], price: coreDocs[idx][6], status: 'approved' }));

    for (let d = docIds.length + 1; d <= targetDocs; d++) {
      const authorId = pick(userIds);
      const sm = userSchool[authorId] || pick(schoolMeta);
      const course = pick(sm.courses);
      const type = docTypes[d % docTypes.length];
      const sem = SEMESTERS[d % SEMESTERS.length];
      const tpl = makeDocText(course.raw, sm.code, type, sem, d);
      const price = pick(prices);
      const allowDownload = price === 0 || rand() < 0.65 ? 1 : 0;
      const daysAgo = rInt(1, 240);
      const createdAt = sqlNow(-daysAgo * 86400 * 1000 - rInt(0, 86000) * 1000);

      // Một tỷ lệ nhỏ tài liệu đang chờ duyệt / gắn cờ để trang Admin có hàng đợi thực tế
      let status = 'approved';
      let notes = 'Vượt qua kiểm duyệt tự động.';
      let sim = 0;
      if (d > targetDocs - 14 && d <= targetDocs - 4) {
        status = 'flagged';
        notes = 'Phát hiện dấu hiệu cần kiểm duyệt viên xác minh thủ công (từ khoá/độ tương đồng).';
        sim = 0.54;
      } else if (d > targetDocs - 4) {
        status = 'taken_down';
        notes = 'Đã gỡ theo yêu cầu Notice & Takedown.';
      }

      const views = status === 'approved' ? rInt(12, 1850) : rInt(1, 15);
      const downloads = status === 'approved' && allowDownload ? Math.floor(views * (0.08 + rand() * 0.22)) : 0;

      const did = db.run(
        `INSERT INTO documents (user_id, school_id, course_id, title, description, doc_type, content, price, allow_download,
           status, moderation_notes, similarity, points_awarded, views, downloads, copyright_agreed_at, agreement_ip, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '127.0.0.1', ?)`,
        [
          authorId, sm.id, course.id,
          `${tpl.title} #${d}`, tpl.desc, type, tpl.body,
          price, allowDownload, status, notes, sim,
          status === 'approved' ? 1 : 0, views, downloads, createdAt, createdAt,
        ]
      ).lastInsertRowid;

      if (status === 'approved') {
        docMeta.push({ id: did, userId: authorId, price, status });
      }
    }

    // 5. Sinh lượt mở khoá, lượt mua tài liệu và đánh giá (reviews)
    db.run('INSERT OR IGNORE INTO unlocks (user_id, document_id) VALUES (?, ?)', [binh, docIds[0]]);
    db.run('INSERT OR IGNORE INTO reviews (user_id, document_id, rating, comment) VALUES (?, ?, 5, ?)', [binh, docIds[0], 'Tài liệu cô đọng, đúng trọng tâm ôn thi. Cảm ơn tác giả!']);
    db.run('INSERT OR IGNORE INTO reviews (user_id, document_id, rating, comment) VALUES (?, ?, 4, ?)', [an, docIds[2], 'Đề cương dễ hiểu, phần kiểm định viết rất rõ.']);

    const purchasePairs = new Set();
    const unlockPairs = new Set([`${binh}:${docIds[0]}`]);
    const reviewPairs = new Set([`${binh}:${docIds[0]}`, `${an}:${docIds[2]}`]);

    const numPurchases = scale === 'mini' ? 30 : 1200;
    for (let i = 0; i < numPurchases; i++) {
      const dm = pick(docMeta);
      if (dm.price <= 0) continue;
      const buyer = pick(userIds);
      if (buyer === dm.userId) continue;
      const key = `${buyer}:${dm.id}`;
      if (purchasePairs.has(key)) continue;
      purchasePairs.add(key);
      const commission = Math.round(dm.price * config.DOC_COMMISSION_RATE);
      const createdAt = sqlNow(-rInt(1, 120) * 86400 * 1000);
      db.run('INSERT INTO purchases (user_id, document_id, price, commission, created_at) VALUES (?, ?, ?, ?, ?)', [buyer, dm.id, dm.price, commission, createdAt]);
      db.run("INSERT INTO revenue (source, amount, ref, created_at) VALUES ('commission', ?, ?, ?)", [commission, 'doc#' + dm.id, createdAt]);
    }

    const numUnlocks = scale === 'mini' ? 40 : 2200;
    for (let i = 0; i < numUnlocks; i++) {
      const dm = pick(docMeta);
      if (dm.price > 0) continue;
      const u = pick(userIds);
      if (u === dm.userId) continue;
      const key = `${u}:${dm.id}`;
      if (unlockPairs.has(key)) continue;
      unlockPairs.add(key);
      db.run('INSERT INTO unlocks (user_id, document_id, created_at) VALUES (?, ?, ?)', [u, dm.id, sqlNow(-rInt(1, 150) * 86400 * 1000)]);
    }

    const numReviews = scale === 'mini' ? 60 : 3600;
    for (let i = 0; i < numReviews; i++) {
      const dm = pick(docMeta);
      const reviewer = pick(userIds);
      if (reviewer === dm.userId) continue;
      const key = `${reviewer}:${dm.id}`;
      if (reviewPairs.has(key)) continue;
      reviewPairs.add(key);
      const rating = pick([3, 4, 4, 4, 5, 5, 5, 5]);
      const comment = pick(REVIEW_COMMENTS);
      db.run('INSERT INTO reviews (user_id, document_id, rating, comment, created_at) VALUES (?, ?, ?, ?, ?)', [
        reviewer, dm.id, rating, comment, sqlNow(-rInt(1, 150) * 86400 * 1000),
      ]);
    }

    // Cập nhật thống kê rating_avg & rating_count cho toàn bộ tài liệu trong 1 câu lệnh
    db.run(`
      UPDATE documents SET
        rating_count = COALESCE((SELECT COUNT(*) FROM reviews r WHERE r.document_id = documents.id), 0),
        rating_avg   = COALESCE((SELECT ROUND(AVG(rating), 2) FROM reviews r WHERE r.document_id = documents.id), 0)
    `);

    // 6. Chợ giáo trình cũ (~320 tin đăng + ~140 đơn hàng)
    const locations = [
      'KTX Bách khoa – Hai Bà Trưng', 'Cổng Trần Đại Nghĩa', 'Thư viện Tạ Quang Bửu', 'Xuân Thuỷ – Cầu Giấy',
      'Chùa Láng – Đống Đa', 'Làng Đại học Thủ Đức', 'Cơ sở Nguyễn Văn Cừ – Q.5', 'Cơ sở 279 Nguyễn Tri Phương – Q.10',
      'Học viện Bưu chính – Hà Đông', 'Cơ sở Nguyễn Trãi – Thanh Xuân', 'Hồ Tùng Mậu – Cầu Giấy',
    ];
    const condKeys = ['new', 'good', 'good', 'fair', 'fair', 'worn'];
    const bookPrefixes = ['Giáo trình', 'Sách bài tập', 'Tài liệu tham khảo', 'Tuyển tập bài tập', 'Hướng dẫn học tập'];
    const listingPrices = [0, 20000, 25000, 30000, 35000, 40000, 45000, 55000, 65000, 80000, 95000, 120000];

    const coreListings = [
      [an, 'HUST', 'Giải tích I – Tuyển tập bài tập & hướng dẫn', 'Bộ môn Toán cơ bản', 'MI1111', 'good', 45000, 1, 'KTX Bách khoa', 'Sách còn tốt, bìa cứng, có ghi chú công thức bằng bút chì.'],
      [binh, 'NEU', 'Kinh tế lượng – Bài tập và thực hành Stata/EViews', 'Khoa Toán Kinh tế', 'TOKT1101', 'fair', 35000, 0, 'Cổng Trần Đại Nghĩa', 'Ruột sạch, đã bọc nilon, tặng kèm bảng tra phân phối t và F.'],
      [chi, 'UET', 'Introduction to Algorithms (CLRS – bản in tham khảo)', 'Cormen, Leiserson, Rivest, Stein', 'INT2210', 'good', 120000, 1, 'Xuân Thuỷ – Cầu Giấy', 'Sách dày, giấy vàng chống loá, nhận trao đổi sách Cơ sở dữ liệu.'],
      [chi, 'UET', 'Đại số tuyến tính và ứng dụng', 'Nhiều tác giả', 'MAT1093', 'good', 0, 1, 'Xuân Thuỷ – Cầu Giấy', 'Tặng miễn phí cho sinh viên khoá dưới.'],
    ];
    const listingIds = [];
    for (const l of coreListings) {
      listingIds.push({
        id: db.run(
          'INSERT INTO listings (seller_id, school_id, title, author, course_code, condition, price, exchange_ok, location, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [l[0], sid(l[1]), ...l.slice(2)]
        ).lastInsertRowid,
        sellerId: l[0],
        price: l[6],
        status: 'available',
      });
    }

    const totalListings = scale === 'mini' ? 20 : 320;
    for (let i = 5; i <= totalListings; i++) {
      const seller = pick(userIds);
      const sm = userSchool[seller] || pick(schoolMeta);
      const course = pick(sm.courses);
      const prefix = pick(bookPrefixes);
      const cond = pick(condKeys);
      const price = pick(listingPrices);
      const exch = rand() < 0.45 ? 1 : 0;
      const loc = pick(locations);
      const createdAt = sqlNow(-rInt(1, 120) * 86400 * 1000);
      const lid = db.run(
        `INSERT INTO listings (seller_id, school_id, title, author, course_code, condition, price, exchange_ok, location, description, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'available', ?)`,
        [
          seller, sm.id, `${prefix} ${course.name} (${course.code})`, `Bộ môn / Khoa chuyên ngành ${sm.code}`,
          course.code, cond, price, exch, loc,
          `Sách phục vụ học phần ${course.name} (${course.code}) tại ${sm.name}. Tình trạng: ${config.CONDITIONS[cond].toLowerCase()}, nhận giao trực tiếp tại ${loc}.`,
          createdAt,
        ]
      ).lastInsertRowid;
      listingIds.push({ id: lid, sellerId: seller, price, status: 'available' });
    }

    // Sinh ~140 đơn hàng giáo trình
    const totalOrders = scale === 'mini' ? 10 : 140;
    for (let i = 0; i < totalOrders && i + 10 < listingIds.length; i++) {
      const item = listingIds[i + 10]; // giữ 10 tin đầu luôn 'available'
      let buyer = pick(userIds);
      if (buyer === item.sellerId) buyer = userIds[(buyer + 1) % userIds.length];
      const oStatus = pick(['completed', 'completed', 'completed', 'confirmed', 'pending', 'cancelled']);
      const fee = item.price > 0 ? Math.max(config.MARKET_FEE_MIN, Math.round(item.price * config.MARKET_FEE_RATE)) : 0;
      const createdAt = sqlNow(-rInt(1, 90) * 86400 * 1000);
      const oid = db.run(
        'INSERT INTO orders (listing_id, buyer_id, seller_id, price, fee, status, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [item.id, buyer, item.sellerId, item.price, oStatus === 'completed' ? fee : 0, oStatus, 'Mình nhận sách giờ ra chơi tại sảnh thư viện nhé.', createdAt, createdAt]
      ).lastInsertRowid;

      if (oStatus === 'completed') {
        db.run("UPDATE listings SET status = 'sold' WHERE id = ?", [item.id]);
        if (fee > 0) db.run("INSERT INTO revenue (source, amount, ref, created_at) VALUES ('txn_fee', ?, ?, ?)", [fee, 'order#' + oid, createdAt]);
      } else if (oStatus === 'confirmed' || oStatus === 'pending') {
        db.run("UPDATE listings SET status = 'reserved' WHERE id = ?", [item.id]);
      }
    }

    // 7. Diễn đàn (~160 bài thảo luận + ~550 bình luận)
    const p1 = db.run(
      'INSERT INTO posts (user_id, school_id, course_code, category, title, body) VALUES (?, ?, ?, ?, ?, ?)',
      [an, sid('HUST'), 'IT3011', 'experience', 'Lộ trình 3 tuần ôn CTDL&GT đạt điểm A tại Bách khoa', 'Tuần 1 hệ thống hoá danh sách liên kết, ngăn xếp, hàng đợi; tuần 2 tập trung cây AVL và bảng băm; tuần 3 luyện đồ thị BFS/DFS/Dijkstra và tự viết lại các thuật toán sắp xếp trên giấy.']
    ).lastInsertRowid;
    db.run('INSERT INTO comments (post_id, user_id, body) VALUES (?, ?, ?)', [p1, chi, 'Bên UET cấu trúc đề cũng rất giống, nhất là câu xoay cây AVL và câu tìm đường đi ngắn nhất.']);

    const postCats = ['experience', 'question', 'tips', 'old_exams'];
    const totalPosts = scale === 'mini' ? 15 : 160;
    const postIds = [p1];
    for (let i = 2; i <= totalPosts; i++) {
      const author = pick(userIds);
      const sm = userSchool[author] || pick(schoolMeta);
      const course = pick(sm.courses);
      const cat = postCats[i % postCats.length];
      const topic = pick(course.topics);
      const titleByCat = {
        experience: `[${sm.code} – ${course.code}] Review cấu trúc đề thi và cách ôn phần ${topic}`,
        question: `[Hỏi đáp ${course.code}] Cách xử lý dạng bài ${topic} khi đề cho tham số tổng quát?`,
        tips: `Mẹo hệ thống hoá nhanh học phần ${course.name} (${course.code}) trước kỳ thi 7 ngày`,
        old_exams: `Tổng hợp các câu hỏi thường gặp môn ${course.name} (${course.code} – ${sm.code})`,
      }[cat];
      const body = `Mình vừa hoàn thành học phần **${course.name} (${course.code})** tại ${sm.name}.\n\n- Trọng tâm xuất hiện nhiều nhất: **${topic}**.\n- Lưu ý khi trình bày: nêu rõ điều kiện áp dụng trước khi thay công thức, kiểm tra kỹ các trường hợp biên.\n\nMọi người cùng học môn này ở kỳ hiện tại có thể trao đổi thêm bên dưới nhé!`;
      const createdAt = sqlNow(-rInt(1, 120) * 86400 * 1000);
      postIds.push(
        db.run('INSERT INTO posts (user_id, school_id, course_code, category, title, body, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [
          author, sm.id, course.code, cat, titleByCat, body, createdAt,
        ]).lastInsertRowid
      );
    }

    const sampleReplies = [
      'Cảm ơn bạn, đúng phần mình đang bị vướng khi làm đề cương.',
      'Kỳ trước lớp mình thi cũng ra đúng trọng tâm chương này, chiếm 3 điểm.',
      'Mình bổ sung thêm: nên luyện tính tay phần này vì vào phòng thi rất dễ nhầm dấu.',
      'Đã lưu lại để cuối tuần ôn, cảm ơn bạn đã tổng hợp chi tiết.',
      'Ở trường mình giảng viên cũng nhấn mạnh điều kiện áp dụng trước khi dùng công thức.',
    ];
    const totalComments = scale === 'mini' ? 30 : 550;
    for (let i = 0; i < totalComments; i++) {
      const pid = pick(postIds);
      const uid = pick(userIds);
      db.run('INSERT INTO comments (post_id, user_id, body, created_at) VALUES (?, ?, ?, ?)', [
        pid, uid, pick(sampleReplies), sqlNow(-rInt(1, 90) * 86400 * 1000),
      ]);
    }

    // 8. Bộ thẻ Flashcard (~80 bộ thẻ, ~500 thẻ)
    const deck1 = db.run('INSERT INTO flashcard_decks (user_id, document_id, title, description) VALUES (?, ?, ?, ?)', [
      an, docIds[0], 'Thuật ngữ CTDL & Giải thuật (IT3011)', 'Bộ thẻ ôn nhanh độ phức tạp và cấu trúc dữ liệu',
    ]).lastInsertRowid;
    for (const [f, b] of [
      ['Stack (Ngăn xếp)', 'Cấu trúc LIFO – vào sau ra trước, thao tác push/pop đều O(1)'],
      ['Queue (Hàng đợi)', 'Cấu trúc FIFO – vào trước ra trước, thao tác enqueue/dequeue O(1)'],
      ['Heap (Đống nhị phân)', 'Cây nhị phân hoàn chỉnh thoả tính chất đống, lấy phần tử cực trị O(1)'],
      ['Hash Table (Bảng băm)', 'Ánh xạ khoá sang chỉ số mảng qua hàm băm, tra cứu trung bình O(1)'],
      ['BFS (Tìm kiếm theo chiều rộng)', 'Duyệt đồ thị theo từng lớp bằng hàng đợi, tìm đường đi ngắn nhất không trọng số'],
      ['Dijkstra', 'Thuật toán tìm đường đi ngắn nhất từ một đỉnh với trọng số không âm, độ phức tạp O((V+E) log V)'],
    ]) db.run('INSERT INTO flashcards (deck_id, front, back) VALUES (?, ?, ?)', [deck1, f, b]);

    const totalDecks = scale === 'mini' ? 8 : 80;
    for (let i = 2; i <= totalDecks; i++) {
      const uid = pick(userIds);
      const sm = userSchool[uid] || pick(schoolMeta);
      const course = pick(sm.courses);
      const did = db.run('INSERT INTO flashcard_decks (user_id, title, description) VALUES (?, ?, ?)', [
        uid, `Ôn nhanh ${course.code} – ${course.name}`, `Các khái niệm trọng tâm môn ${course.name} (${sm.code})`,
      ]).lastInsertRowid;
      for (const topic of course.topics) {
        db.run('INSERT INTO flashcards (deck_id, front, back, box) VALUES (?, ?, ?, ?)', [
          did, `${topic} trong ${course.code} là gì?`,
          `Nội dung trọng tâm của học phần ${course.name}: nắm định nghĩa, điều kiện áp dụng và quy trình giải chuẩn.`,
          rInt(1, 4),
        ]);
      }
    }

    // 9. Khiếu nại bản quyền mẫu (Notice & Takedown)
    const deadlineOpen = sqlNow(48 * 3600 * 1000);
    db.run(
      `INSERT INTO reports (document_id, reporter_name, reporter_email, reporter_role, original_work, reason, evidence_url, status, deadline)
       VALUES (?, 'TS. Nguyễn Minh Hoàng', 'hoang.nm@hust.edu.vn', 'lecturer', 'Tập bài giảng nội bộ Giải tích', 'Một phần phụ lục trong tài liệu có dấu hiệu trích dẫn quá mức từ tài liệu bài tập bộ môn.', 'https://sis.hust.edu.vn', 'open', ?)`,
      [docIds[1], deadlineOpen]
    );

    // 10. Quảng cáo đối tác
    const ads = [
      ['Nhà sách Fahasa Sinh Viên', 'bookstore', 'Ưu đãi 20% sách học thuật & ngoại văn đầu học kỳ', 'Áp dụng khi xác thực email .edu.vn tại hệ thống nhà sách toàn quốc.', 'https://example.com/nha-sach', 'sidebar', 5000000],
      ['Học viện Anh ngữ Học thuật', 'language', 'Lớp luyện thi IELTS Academic & TOEIC cho sinh viên năm 3–4', 'Kiểm tra đầu vào miễn phí, lịch học ca tối linh hoạt gần các cụm trường đại học.', 'https://example.com/ielts', 'home', 8000000],
      ['Data & Software Lab', 'course', 'Học bổng 50% khoá thực chiến Backend & Data Engineering', 'Dành cho sinh viên khối ngành CNTT, Kinh tế lượng, Khoa học dữ liệu.', 'https://example.com/bootcamp', 'home', 6000000],
      ['Không gian tự học 24/7 StudyHub', 'service', 'Gói tháng phòng tự học nhóm có bảng trắng & máy chiếu', 'Cơ sở Bách Khoa – Kinh tế Quốc dân, Cầu Giấy và Làng ĐH Thủ Đức.', 'https://example.com/studyhub', 'sidebar', 3500000],
    ];
    for (const a of ads) {
      const id = db.run(
        'INSERT INTO ads (advertiser, category, title, body, link_url, placement, budget, impressions, clicks) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [...a, rInt(1200, 6500), rInt(80, 420)]
      ).lastInsertRowid;
      db.run("INSERT INTO revenue (source, amount, ref) VALUES ('ads', ?, ?)", [a[6], 'ad#' + id]);
    }

    // Lịch sử ví mẫu cho tài khoản demo
    db.run("INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, 'topup', 500000, 500000, 'Nạp ví qua VNPay QR')", [an]);
    db.run("INSERT INTO transactions (user_id, type, amount, balance_after, description) VALUES (?, 'topup', 200000, 200000, 'Nạp ví qua MoMo')", [binh]);
  });

  const uCount = db.get("SELECT COUNT(*) AS c FROM users WHERE role = 'user'").c;
  const dCount = db.get('SELECT COUNT(*) AS c FROM documents').c;
  const rCount = db.get('SELECT COUNT(*) AS c FROM reviews').c;
  const lCount = db.get('SELECT COUNT(*) AS c FROM listings').c;
  console.log(`🌱 Đã khởi tạo CSDL trong ${Date.now() - t0}ms: ${uCount} sinh viên, ${dCount} tài liệu, ${rCount} đánh giá, ${lCount} giáo trình.`);
}

// `npm run seed` -> reset toàn bộ dữ liệu
if (require.main === module) {
  (async () => {
    if (fs.existsSync(db.DB_FILE)) fs.unlinkSync(db.DB_FILE);
    for (const sub of ['docs', 'listing-images']) {
      const dir = path.join(db.DATA_DIR, sub);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    }
    await db.init();
    await ensureDefaults({ demo: true });
    db.close();
    console.log('✅ Khởi tạo dữ liệu hoàn tất. Chạy `npm start` để khởi động.');
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { ensureDefaults };
