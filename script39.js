angular.module('smartmenus', []);

angular
	.module('smartmenus')
	.directive('smartMenus', function () {
		return {
			restrict: "A",
			link: function (scope, element, attrs, ctrl) {
				$.SmartMenus.Bootstrap.init();
			}
		}
	});